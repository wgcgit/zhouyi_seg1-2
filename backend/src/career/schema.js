'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', '..', '..', 'docs', 'CAREER_SCHEMA.md');

/**
 * 统一换行符为 LF。
 * Windows 上 git 的 core.autocrlf=true 会把入库的 LF 检出成 CRLF，
 * 而下面的正则对行尾敏感（枚举表格按 `\n|` / `\n\n` 定位），
 * 所以解析前必须先归一化，否则新克隆的仓库里 require 本模块就会抛错。
 */
function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

/** 从 markdown 里抠出 ```json 包裹的机读契约块 */
function extractMachineSchema(text) {
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(normalizeEol(text));
  if (!m) throw new Error('CAREER_SCHEMA.md 里找不到 ```json 机读契约块');
  return JSON.parse(m[1]);
}

/** 从人读的「枚举速查」表格里解析出闭合枚举 */
function extractEnums(text) {
  const table = /##\s*枚举速查[\s\S]*?\n\|[^\n]*\|\n\|[-|\s]*\|\n([\s\S]*?)\n\n/.exec(normalizeEol(text));
  if (!table) throw new Error('CAREER_SCHEMA.md 里找不到「枚举速查」表格');
  const enums = [];
  for (const line of table[1].split('\n')) {
    // markdown 行首行尾的 `|` 会切出空串，所以路径在 cells[1]、取值在 cells[2]
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 4) continue;
    const fieldPath = cells[1].replace(/`/g, '');
    const values = cells[2]
      .split('/')
      .map((s) => s.trim().replace(/`/g, ''))
      .filter(Boolean);
    if (fieldPath && values.length) enums.push({ path: fieldPath, values });
  }
  return enums;
}

/**
 * 解析契约源。
 * @returns {{topLevelKeys: string[], enums: Array<{path,values}>, machineSchema: object}}
 */
function parseSchemaSource(markdownText) {
  const machineSchema = extractMachineSchema(markdownText);
  const topLevelKeys = machineSchema.required.slice();
  const enums = extractEnums(markdownText);
  return { topLevelKeys, enums, machineSchema };
}

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const parsed = parseSchemaSource(source);

const TOP_LEVEL_KEYS = parsed.topLevelKeys;
const ENUMS = parsed.enums;
const MACHINE_SCHEMA = parsed.machineSchema;

module.exports = { parseSchemaSource, normalizeEol, TOP_LEVEL_KEYS, ENUMS, MACHINE_SCHEMA, SOURCE_PATH };
