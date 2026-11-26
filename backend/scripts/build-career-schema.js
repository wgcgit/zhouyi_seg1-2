'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const TARGET_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');

/**
 * 契约解析模块按需加载。
 *
 * `src/career/schema.js` 在**模块加载阶段**就会解析契约源（它要导出
 * TOP_LEVEL_KEYS / ENUMS 等常量），所以契约源坏到无法解析时，
 * 普通的顶层 require 会当场抛异常、把一长串栈追踪甩到用户脸上。
 * 按需加载把这次失败推迟到调用点，于是 CLI 入口的 try/catch 能把它
 * 转成干净的中文消息。
 *
 * @returns {object} `src/career/schema` 的导出
 */
function schemaApi() {
  return require('../src/career/schema');
}

/**
 * 从契约源生成注入 prompt 用的机读契约。
 * 只输出机读部分（JSON Schema），人读散文不进 prompt —— 散文太长且与 Schema 重复。
 */
function buildSchemaMarkdown(sourceText) {
  const { parseSchemaSource } = schemaApi();
  const { machineSchema, topLevelKeys } = parseSchemaSource(sourceText);
  const header = [
    '# 事业推理 JSON Schema（自动生成，勿手改）',
    '',
    '本文件由 `npm run build:schema` 从 `docs/CAREER_SCHEMA.md` 生成。',
    '改契约请改源文件，然后重新生成并跑 `npm run validate:schema`。',
    '',
    `顶层 ${topLevelKeys.length} 个键，顺序即输出顺序：`,
    '',
    '```',
    topLevelKeys.join(' → '),
    '```',
    '',
  ].join('\n');
  return header + '\n```json\n' + JSON.stringify(machineSchema, null, 2) + '\n```\n';
}

/**
 * 生成入口：先断言两处枚举声明一致，再写盘。
 *
 * 这一步是**生成期 fail-closed**：人读的「枚举速查」表与机读的契约块是互相独立
 * 的两份声明，只改其中一边时若还能生成成功，生成物会被写盘、提交入库，
 * 于是 prompt 里告诉模型的合法取值与运行期校验用的取值分叉 ——
 * 模型每一次输出都被校验器拒绝，而 CI 一声不响。
 * 所以漂移就抛中文错误、绝不写盘。
 *
 * 注意：断言只在这里，`buildSchemaMarkdown` 仍是纯函数、不抛错 ——
 * 校验脚本 `validateGenerated` 依赖它「返回错误数组而非抛错」的语义。
 *
 * @param {string} sourceText 契约源全文
 * @param {string} [targetPath] 生成物落盘路径（默认写正式生成物；测试传临时路径）
 * @returns {string} 生成物内容
 */
function generate(sourceText, targetPath) {
  let output;
  try {
    const { parseSchemaSource, assertEnumsConsistent } = schemaApi();
    const { enums, machineSchema } = parseSchemaSource(sourceText);
    assertEnumsConsistent(enums, machineSchema);
    output = buildSchemaMarkdown(sourceText);
  } catch (e) {
    throw new Error('契约生成中止（未写盘）：' + (e && e.message ? e.message : String(e)));
  }
  fs.writeFileSync(targetPath || TARGET_PATH, output, 'utf8');
  return output;
}

/**
 * CLI 入口。可注入 sourceText / targetPath 以便测试。
 * @returns {number} 进程退出码（0 = 成功，1 = 失败）
 */
function main(options = {}) {
  const sourceText = options.sourceText !== undefined
    ? options.sourceText
    : fs.readFileSync(SOURCE_PATH, 'utf8');
  const targetPath = options.targetPath !== undefined ? options.targetPath : TARGET_PATH;
  try {
    const output = generate(sourceText, targetPath);
    console.log(`已生成 ${path.relative(ROOT, targetPath)}（${output.length} 字符）`);
    return 0;
  } catch (e) {
    console.error('✗ 契约生成失败：' + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { buildSchemaMarkdown, generate, main, SOURCE_PATH, TARGET_PATH };
