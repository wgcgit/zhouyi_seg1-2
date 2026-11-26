'use strict';

const fs = require('fs');
const path = require('path');
const { parseSchemaSource } = require('../src/career/schema');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const TARGET_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');

/**
 * 从契约源生成注入 prompt 用的机读契约。
 * 只输出机读部分（JSON Schema），人读散文不进 prompt —— 散文太长且与 Schema 重复。
 */
function buildSchemaMarkdown(sourceText) {
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

function main() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const output = buildSchemaMarkdown(sourceText);
  fs.writeFileSync(TARGET_PATH, output, 'utf8');
  console.log(`已生成 ${path.relative(ROOT, TARGET_PATH)}（${output.length} 字符）`);
}

if (require.main === module) main();

module.exports = { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH };
