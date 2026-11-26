'use strict';

const fs = require('fs');
const path = require('path');
const { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH } = require('./build-career-schema');
const { normalizeEol, parseSchemaSource, findEnumMismatches } = require('../src/career/schema');

/**
 * 校验生成物与源一致。
 * 比较前统一换行符：Windows 上 git 检出会把 LF 变成 CRLF，
 * 生成物磁盘内容与内存里重建的文本会因行尾不同而不相等。
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateGenerated(sourceText, generatedText) {
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
  const { enums, machineSchema } = parseSchemaSource(sourceText);
  return findEnumMismatches(enums, machineSchema).map(
    (m) => `docs/CAREER_SCHEMA.md 的枚举速查表与机读契约块不一致：${m}`,
  );
}

function main() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const generatedText = fs.readFileSync(TARGET_PATH, 'utf8');
  const errors = validateGenerated(sourceText, generatedText).concat(validateEnums(sourceText));
  if (errors.length) {
    for (const e of errors) console.error('✗ ' + e);
    process.exit(1);
  }
  console.log('✓ 契约生成物与源一致，且两处枚举声明一致');
}

if (require.main === module) main();

module.exports = { validateGenerated, validateEnums };
