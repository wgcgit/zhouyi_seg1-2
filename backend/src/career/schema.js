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
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    // 裸的 SyntaxError 看不出是哪个文件哪块坏了，包装成中文错误
    throw new Error('CAREER_SCHEMA.md 的机读契约块不是合法 JSON：' + e.message);
  }
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
 * 8 组闭合枚举在机读契约块里的**显式**位置。
 *
 * 人读表格的第一列（如 `playbooks[].scale`）与机读块里的 JSON 位置
 * （如 `properties.playbooks.items.properties.scale.enum`）不是同一套寻址方式，
 * 所以这里把 8 处逐条写死成取值函数，不做任何字符串拼接去猜 JSON 路径。
 * `tablePath` 与人读表格第一列逐字相同，是两处声明的连接键。
 */
const ENUM_LOCATIONS = [
  { tablePath: 'pattern.verdict', get: (m) => m.properties.pattern.properties.verdict.enum },
  { tablePath: 'tiaoHou.climateType', get: (m) => m.properties.tiaoHou.properties.climateType.enum },
  { tablePath: 'tiaoHou.drugStatus', get: (m) => m.properties.tiaoHou.properties.drugStatus.enum },
  { tablePath: 'playbooks[].scale', get: (m) => m.properties.playbooks.items.properties.scale.enum },
  { tablePath: 'timeline[].type', get: (m) => m.properties.timeline.items.properties.type.enum },
  { tablePath: 'timeline[].verdict', get: (m) => m.properties.timeline.items.properties.verdict.enum },
  {
    tablePath: 'timeline[].liunianWindows[].action',
    get: (m) => m.properties.timeline.items.properties.liunianWindows.items.properties.action.enum,
  },
  { tablePath: 'summary.strategy', get: (m) => m.properties.summary.properties.strategy.enum },
];

/**
 * 遍历机读契约块，收集所有带 `enum` 的字段。
 *
 * 路径写法与人读「枚举速查」表格的第一列一致：`[]` 表示「数组的 items」，
 * 所以 `playbooks` 的 `items.properties.scale` 会得到 `playbooks[].scale`。
 * 遍历顺序即机读块里这些 `enum` 出现的顺序。
 *
 * @param {object} machineSchema 机读契约块
 * @returns {Array<{path: string, values: string[]}>}
 */
function collectEnumPaths(machineSchema) {
  const found = [];
  const walk = (node, nodePath) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.enum)) found.push({ path: nodePath, values: node.enum.slice() });
    if (node.properties && typeof node.properties === 'object') {
      for (const key of Object.keys(node.properties)) {
        walk(node.properties[key], nodePath ? `${nodePath}.${key}` : key);
      }
    }
    if (node.items && typeof node.items === 'object') {
      walk(node.items, `${nodePath}[]`);
    }
  };
  for (const key of Object.keys((machineSchema && machineSchema.properties) || {})) {
    walk(machineSchema.properties[key], key);
  }
  return found;
}

/**
 * 比对「人读枚举速查表」与「机读契约块」两处枚举声明是否完全一致。
 *
 * 这两处是**互相独立的两份声明**：任何一边被单独改掉（比如只改了机读块里的
 * `enum`），prompt 里的合法取值就会与运行期校验用的取值分叉，模型输出会被
 * 全部拒绝而 CI 一声不响。所以这里把「集合相等 + 取值逐字相同 + 顺序相同」
 * 一起断言出来。
 *
 * @param {Array<{path: string, values: string[]}>} tableEnums 人读表格解析出的枚举
 * @param {object} machineSchema 机读契约块
 * @returns {string[]} 不一致的说明列表，空数组表示一致
 */
function findEnumMismatches(tableEnums, machineSchema) {
  const errors = [];
  const tableByPath = new Map(tableEnums.map((e) => [e.path, e.values]));
  const expectedPaths = ENUM_LOCATIONS.map((l) => l.tablePath);

  // 一、人读表格的路径集合必须与登记的 8 组完全一致
  for (const p of expectedPaths) {
    if (!tableByPath.has(p)) errors.push(`枚举速查表里缺少 ${p}`);
  }
  for (const e of tableEnums) {
    if (!expectedPaths.includes(e.path)) errors.push(`枚举速查表里出现了未登记的枚举组 ${e.path}`);
  }

  // 二、机读契约块里带 enum 的字段集合必须恰好是这 8 组（多一个少一个都要报）
  const collected = collectEnumPaths(machineSchema);
  const collectedPaths = collected.map((c) => c.path);
  if (collectedPaths.length !== expectedPaths.length) {
    errors.push(`机读契约块里的枚举组数是 ${collectedPaths.length}，期望 ${expectedPaths.length}`);
  }
  for (const p of collectedPaths) {
    if (!expectedPaths.includes(p)) errors.push(`机读契约块里多出枚举组 ${p}`);
  }
  for (const p of expectedPaths) {
    if (!collectedPaths.includes(p)) errors.push(`机读契约块里缺少枚举组 ${p}`);
  }

  // 三、两处的顺序必须一致（速查表顺序 = 机读块里 8 个 enum 出现的顺序）
  if (tableEnums.map((e) => e.path).join('|') !== expectedPaths.join('|')) {
    errors.push(
      `枚举速查表里的顺序是 ${tableEnums.map((e) => e.path).join(' → ')}，` +
      `期望 ${expectedPaths.join(' → ')}`,
    );
  }
  if (collectedPaths.join('|') !== expectedPaths.join('|')) {
    errors.push(
      `机读契约块里枚举的出现顺序是 ${collectedPaths.join(' → ')}，` +
      `期望 ${expectedPaths.join(' → ')}`,
    );
  }

  // 四、逐组取值必须逐字相同（含顺序）
  for (const loc of ENUM_LOCATIONS) {
    const tableValues = tableByPath.get(loc.tablePath);
    if (!tableValues) continue;
    const machineValues = loc.get(machineSchema);
    if (!Array.isArray(machineValues)) {
      errors.push(`机读契约块里 ${loc.tablePath} 的位置没有 enum 数组`);
      continue;
    }
    if (JSON.stringify(machineValues) !== JSON.stringify(tableValues)) {
      errors.push(
        `枚举组 ${loc.tablePath} 的取值不一致：速查表 ${JSON.stringify(tableValues)}，` +
        `机读契约块 ${JSON.stringify(machineValues)}`,
      );
    }
  }

  return errors;
}

/** 两处枚举声明不一致就抛中文错误（供运行期/校验期使用） */
function assertEnumsConsistent(tableEnums, machineSchema) {
  const errors = findEnumMismatches(tableEnums, machineSchema);
  if (errors.length) {
    throw new Error('CAREER_SCHEMA.md 的枚举速查表与机读契约块不一致：\n- ' + errors.join('\n- '));
  }
}

/**
 * 解析契约源。
 *
 * 注意：这里**不**顺手校验两处枚举声明的一致性 —— 一致性由
 * `findEnumMismatches` / `assertEnumsConsistent` 独立提供，
 * 由测试与校验脚本 `validate-career-schema.js` 调用。
 * 这样本模块在源文件漂移时仍能加载，漂移的具体差异由测试逐条报出来。
 *
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

module.exports = {
  parseSchemaSource,
  normalizeEol,
  TOP_LEVEL_KEYS,
  ENUMS,
  MACHINE_SCHEMA,
  SOURCE_PATH,
  ENUM_LOCATIONS,
  collectEnumPaths,
  findEnumMismatches,
  assertEnumsConsistent,
};
