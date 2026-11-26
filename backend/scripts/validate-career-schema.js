'use strict';

const fs = require('fs');
const path = require('path');
const { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH } = require('./build-career-schema');
const { normalizeEol } = require('../src/career/schema');

/**
 * 校验生成物与源一致。
 * 比较前统一换行符：Windows 上 git 检出会把 LF 变成 CRLF，
 * 生成物磁盘内容与内存里重建的文本会因行尾不同而不相等。
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateGenerated(sourceText, generatedText) {
  const errors = [];
  const expected = buildSchemaMarkdown(sourceText);
  if (normalizeEol(expected) !== normalizeEol(generatedText)) {
    errors.push(
      `backend/prompts/CAREER_SCHEMA.md 与 docs/CAREER_SCHEMA.md 不同步：` +
      `请运行 npm run build:schema 重新生成（期望 ${expected.length} 字符，实际 ${generatedText.length} 字符）`,
    );
  }
  return errors;
}

function main() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const generatedText = fs.readFileSync(TARGET_PATH, 'utf8');
  const errors = validateGenerated(sourceText, generatedText);
  if (errors.length) {
    for (const e of errors) console.error('✗ ' + e);
    process.exit(1);
  }
  console.log('✓ 契约生成物与源一致');
}

if (require.main === module) main();

module.exports = { validateGenerated };
