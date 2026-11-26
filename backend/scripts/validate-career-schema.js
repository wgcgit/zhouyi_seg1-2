'use strict';

const fs = require('fs');
const path = require('path');
const { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH } = require('./build-career-schema');

/**
 * 契约解析模块按需加载。
 *
 * `src/career/schema.js` 在**模块加载阶段**就会解析契约源（它要导出
 * TOP_LEVEL_KEYS / ENUMS 等常量），所以契约源坏到无法解析时，
 * 普通的顶层 require 会当场抛异常、把一长串栈追踪甩到用户脸上，
 * 连 `main()` 的 try/catch 都进不去。按需加载把这次失败推迟到调用点，
 * 于是 try/catch 能把它转成干净的中文消息。
 *
 * @returns {object} `src/career/schema` 的导出
 */
function schemaApi() {
  return require('../src/career/schema');
}

/**
 * 校验生成物与源一致。
 * 比较前统一换行符：Windows 上 git 检出会把 LF 变成 CRLF，
 * 生成物磁盘内容与内存里重建的文本会因行尾不同而不相等。
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateGenerated(sourceText, generatedText) {
  const { normalizeEol } = schemaApi();
  const errors = [];
  // 比较与报数都基于归一化后的文本：
  // Windows 上 git 检出会把 LF 变成 CRLF，若拿归一化前的长度报数，
  // 用户会看到「期望 9606 字符，实际 9678 字符」这种纯行尾差异造成的假差异。
  const expected = normalizeEol(buildSchemaMarkdown(sourceText));
  const actual = normalizeEol(generatedText);
  if (expected !== actual) {
    errors.push(
      `backend/prompts/CAREER_SCHEMA.md 与 docs/CAREER_SCHEMA.md 不同步：` +
      `请运行 npm run build:schema 重新生成` +
      `（归一化行尾后期望 ${expected.length} 字符，实际 ${actual.length} 字符）`,
    );
  }
  return errors;
}

/**
 * 校验契约源自身：人读「枚举速查」表与机读契约块两处枚举声明必须一致。
 *
 * 这两处是互相独立的两份声明，只改其中一边就会让 prompt 里的合法取值
 * 与运行期校验用的取值分叉 —— 模型每一次输出都被拒绝而 CI 一声不响。
 * 这里让 `npm run validate:schema` 把漂移报出来。
 *
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateEnums(sourceText) {
  const { parseSchemaSource, findEnumMismatches } = schemaApi();
  const { enums, machineSchema } = parseSchemaSource(sourceText);
  return findEnumMismatches(enums, machineSchema).map(
    (m) => `docs/CAREER_SCHEMA.md 的枚举速查表与机读契约块不一致：${m}`,
  );
}

/**
 * 校验主流程（CLI 入口，可注入源文本与生成物以便测试）。
 *
 * 契约源被破坏到无法解析时（例如速查表格被删、标题被改名），
 * `validateEnums` 内部的 `parseSchemaSource` 会抛异常。这里把它包进 try/catch，
 * 转成干净的中文 `✗` 消息，而不是打出一长串栈追踪。
 *
 * @param {{sourceText?: string, generatedText?: string}} [options]
 * @returns {number} 进程退出码（0 = 通过，1 = 失败）
 */
function main(options = {}) {
  const sourceText = options.sourceText !== undefined
    ? options.sourceText
    : fs.readFileSync(SOURCE_PATH, 'utf8');
  const generatedText = options.generatedText !== undefined
    ? options.generatedText
    : fs.readFileSync(TARGET_PATH, 'utf8');
  try {
    const errors = validateGenerated(sourceText, generatedText).concat(validateEnums(sourceText));
    if (errors.length) {
      for (const e of errors) console.error('✗ ' + e);
      return 1;
    }
    console.log('✓ 契约生成物与源一致，且两处枚举声明一致');
    return 0;
  } catch (e) {
    console.error('✗ 契约校验失败：' + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { validateGenerated, validateEnums, main };
