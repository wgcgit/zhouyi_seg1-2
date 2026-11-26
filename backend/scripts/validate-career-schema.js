'use strict';

const fs = require('fs');
const path = require('path');
const { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH } = require('./build-career-schema');

/**
 * 校验生成物与源一致。
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateGenerated(sourceText, generatedText) {
  const errors = [];
  const expected = buildSchemaMarkdown(sourceText);
  if (expected !== generatedText) {
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
