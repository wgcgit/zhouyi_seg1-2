'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseSchemaSource, normalizeEol, TOP_LEVEL_KEYS, ENUMS, MACHINE_SCHEMA,
  ENUM_LOCATIONS, collectEnumPaths, findEnumMismatches, assertEnumsConsistent,
} = require('../src/career/schema');
const { validateGenerated, validateEnums } = require('../scripts/validate-career-schema');
const { buildSchemaMarkdown } = require('../scripts/build-career-schema');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const GENERATED_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');
const SAMPLE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json');
const SKILL_PATH = path.join(ROOT, 'backend', 'skills', 'bazi-tuipan', 'shiye-master.skill.md');

const EXPECTED_KEYS = [
  'case', 'monthCommand', 'pattern', 'patternTracks', 'careerPhases', 'tiaoHou',
  'xiJi', 'boundaries', 'directions', 'playbooks', 'timeline', 'transition', 'summary',
];

/** 8 组闭合枚举的路径与取值（顺序 = 机读契约块里 8 个 enum 出现的顺序） */
const EXPECTED_ENUM_PATHS = [
  'pattern.verdict',
  'tiaoHou.climateType',
  'tiaoHou.drugStatus',
  'playbooks[].scale',
  'timeline[].type',
  'timeline[].verdict',
  'timeline[].liunianWindows[].action',
  'summary.strategy',
];

/** 机读契约块里 minItems >= 1 的字段（路径写法与人读表格一致） */
const EXPECTED_MIN_ITEMS_PATHS = [
  'xiJi.xi',
  'xiJi.ji',
  'boundaries',
  'directions',
  'playbooks',
  'playbooks[].actions',
  'timeline',
  'timeline[].liunianWindows',
  'summary.notes',
  'patternTracks.byPattern',
];

/**
 * 按契约路径从样例 JSON 里取值。
 * 路径写法：`playbooks[].scale` 表示「playbooks 数组里每个元素的 scale」。
 */
function collectSampleValues(data, contractPath) {
  let current = [data];
  for (const part of contractPath.split('.')) {
    const isArray = part.endsWith('[]');
    const key = isArray ? part.slice(0, -2) : part;
    const next = [];
    for (const node of current) {
      if (node === undefined || node === null) continue;
      const value = node[key];
      if (isArray) {
        if (!Array.isArray(value)) throw new Error(`样例里 ${contractPath} 的 ${key} 不是数组`);
        next.push(...value);
      } else {
        next.push(value);
      }
    }
    current = next;
  }
  return current;
}

/** 归一化空白：连续空白压成一个空格、去掉换行（只动空白，不动分隔符与键名） */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 从 skill 文件里取出两处 13 键键序串：
 * - 围栏 ``` 代码块里的那一行
 * - 反引号包着的那一串
 */
function extractSkillKeyOrders(skillText) {
  const fenced = /^case → .+$/m.exec(skillText);
  if (!fenced) throw new Error('skill 文件里找不到围栏里的键序串（应以「case → 」开头独占一行）');
  const inline = /`(case → [^`\n]+)`/.exec(skillText);
  if (!inline) throw new Error('skill 文件里找不到反引号包着的键序串');
  return { fenced: fenced[0], inline: inline[1] };
}

/** 从契约源里取出人读的键序代码块（文档里第一个 ``` 块） */
function extractSourceKeyOrder(sourceText) {
  const m = /```[a-zA-Z]*\n([\s\S]*?)\n```/.exec(sourceText);
  if (!m) throw new Error('契约源里找不到 ``` 代码块');
  return m[1];
}


describe('事业推理契约', () => {
  test('顶层是 13 个键，且顺序与契约序一致', () => {
    expect(TOP_LEVEL_KEYS).toEqual(EXPECTED_KEYS);
  });

  test('枚举是 8 组，取值与速查表一致', () => {
    expect(ENUMS).toHaveLength(8);
    const byPath = {};
    for (const e of ENUMS) byPath[e.path] = e.values;
    expect(byPath['pattern.verdict']).toEqual(['成格', '破格', '不清']);
    expect(byPath['tiaoHou.climateType']).toEqual(['寒局', '燥热局', '湿重局', '燥硬局', '春木旺局', '秋金肃局']);
    expect(byPath['tiaoHou.drugStatus']).toEqual(['真药', '藏药', '假药']);
    expect(byPath['playbooks[].scale']).toEqual(['早期', '轻创业', '重资产', '合伙']);
    expect(byPath['timeline[].type']).toEqual(['水运', '木运', '火运', '土运', '金运']);
    expect(byPath['timeline[].verdict']).toEqual(['重仓', '轻试', '守成']);
    expect(byPath['timeline[].liunianWindows[].action']).toEqual(['宜', '忌']);
    expect(byPath['summary.strategy']).toEqual(['主业重仓', '底盘待机', '守成缓投']);
  });

  test('机读契约的 required 与顶层键序完全一致', () => {
    expect(MACHINE_SCHEMA.required).toEqual(EXPECTED_KEYS);
    expect(Object.keys(MACHINE_SCHEMA.properties)).toEqual(EXPECTED_KEYS);
  });

  test('必非空数组都声明了 minItems >= 1', () => {
    const p = MACHINE_SCHEMA.properties;
    expect(p.xiJi.properties.xi.minItems).toBe(1);
    expect(p.xiJi.properties.ji.minItems).toBe(1);
    expect(p.boundaries.minItems).toBe(1);
    expect(p.playbooks.minItems).toBe(1);
    expect(p.playbooks.items.properties.actions.minItems).toBe(1);
    expect(p.timeline.minItems).toBe(1);
    expect(p.timeline.items.properties.liunianWindows.minItems).toBe(1);
    expect(p.summary.properties.notes.minItems).toBe(1);
    expect(p.patternTracks.properties.byPattern.minItems).toBe(1);
    expect(p.directions.minItems).toBe(1);
  });

  test('ciXi 可空、byCombination 可空，且都未声明 minItems', () => {
    const p = MACHINE_SCHEMA.properties;
    expect(p.xiJi.properties.ciXi.minItems).toBeUndefined();
    expect(p.patternTracks.properties.byCombination.minItems).toBeUndefined();
  });

  test('careerPhases 的 early/later 都要求非空串', () => {
    const cp = MACHINE_SCHEMA.properties.careerPhases.properties;
    expect(cp.early.minLength).toBe(1);
    expect(cp.later.minLength).toBe(1);
  });

  test('生成物与源同步', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generatedText = fs.readFileSync(GENERATED_PATH, 'utf8');
    expect(validateGenerated(sourceText, generatedText)).toEqual([]);
  });

  test('源文件被改动而未重新生成时，校验要报错', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generatedText = fs.readFileSync(GENERATED_PATH, 'utf8');
    // 改动必须落在**会被生成物反映出来**的地方 —— 机读契约块的 required 列表。
    // （在源文件末尾追加一句「改动」是不行的：buildSchemaMarkdown 只提取
    //   ```json 块与枚举表，末尾多一行不影响生成物，校验就查不出不同步。）
    const tampered = sourceText.replace(
      '"case", "monthCommand"',
      '"case", "monthCommand", "tampered"',
    );
    expect(tampered).not.toBe(sourceText);   // 确认替换真的发生了
    expect(validateGenerated(tampered, generatedText)).toHaveLength(1);
  });

  test('parseSchemaSource 从 markdown 里能抠出机读块与枚举', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const parsed = parseSchemaSource(sourceText);
    expect(parsed.topLevelKeys).toEqual(EXPECTED_KEYS);
    expect(parsed.enums).toHaveLength(8);
    expect(parsed.machineSchema.type).toBe('object');
  });

  test('buildSchemaMarkdown 的输出含 13 键的键序声明', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const out = buildSchemaMarkdown(sourceText);
    expect(out).toContain('顶层 13 个键');
    for (const key of EXPECTED_KEYS) expect(out).toContain(key);
  });

  test('源文件是 CRLF（Windows 检出）时照样能解析出枚举与机读块', () => {
    // Windows 上 git 的 core.autocrlf=true 会把入库的 LF 检出成 CRLF，
    // 契约解析的正则对行尾敏感，必须先归一化再匹配。
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const lf = sourceText.replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(crlf).not.toBe(lf);
    const parsed = parseSchemaSource(crlf);
    expect(parsed.topLevelKeys).toEqual(EXPECTED_KEYS);
    expect(parsed.enums).toHaveLength(8);
    expect(parsed.machineSchema.type).toBe('object');
  });

  test('CRLF 的生成物与 LF 的生成物校验结果一致（不同步判定不受行尾影响）', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generatedText = fs.readFileSync(GENERATED_PATH, 'utf8');
    const crlfGenerated = generatedText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    expect(validateGenerated(sourceText, crlfGenerated)).toEqual([]);
  });
});

describe('契约一致性守卫', () => {
  test('人读枚举速查表与机读契约块的两处枚举声明逐组一致', () => {
    // 显式登记的 8 组路径（表格路径 → 机读块里的 JSON 位置）
    expect(ENUM_LOCATIONS.map((l) => l.tablePath)).toEqual(EXPECTED_ENUM_PATHS);

    // 人读表格解析出的 8 组：路径与顺序都要一致
    expect(ENUMS.map((e) => e.path)).toEqual(EXPECTED_ENUM_PATHS);

    // 机读契约块里带 enum 的字段：路径集合与顺序都要一致（多一个少一个都失败）
    expect(collectEnumPaths(MACHINE_SCHEMA).map((c) => c.path)).toEqual(EXPECTED_ENUM_PATHS);

    // 逐组取值逐字相同（含顺序）
    for (const loc of ENUM_LOCATIONS) {
      const fromTable = ENUMS.find((e) => e.path === loc.tablePath).values;
      expect(loc.get(MACHINE_SCHEMA)).toEqual(fromTable);
    }

    // 汇总判定：两份声明没有差异
    expect(findEnumMismatches(ENUMS, MACHINE_SCHEMA)).toEqual([]);
    expect(() => assertEnumsConsistent(ENUMS, MACHINE_SCHEMA)).not.toThrow();
  });

  test('两份枚举声明漂移时能报出具体是哪一组、差在哪个值', () => {
    // 只改机读契约块里 summary.strategy 的一个取值，人读表格不动
    const drifted = JSON.parse(JSON.stringify(MACHINE_SCHEMA));
    drifted.properties.summary.properties.strategy.enum = ['重仓', '底盘待机', '守成缓投'];
    const mismatches = findEnumMismatches(ENUMS, drifted);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain('summary.strategy');
    expect(() => assertEnumsConsistent(ENUMS, drifted)).toThrow(/枚举速查表与机读契约块不一致/);
  });

  test('skill 文件里的两处键序串与契约源一致（且都不折行）', () => {
    const skillText = fs.readFileSync(SKILL_PATH, 'utf8').replace(/\r\n/g, '\n');
    const { fenced, inline } = extractSkillKeyOrders(skillText);
    const expected = TOP_LEVEL_KEYS.join(' → ');

    expect(fenced).toBe(expected);
    expect(inline).toBe(expected);
    // 两处都必须单行，不许折行
    expect(fenced).not.toContain('\n');
    expect(inline).not.toContain('\n');
  });

  test('契约源里人读的键序代码块与契约源的键序一致（归一化空白后）', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
    const block = extractSourceKeyOrder(sourceText);
    expect(normalizeWhitespace(block)).toBe(TOP_LEVEL_KEYS.join(' → '));
  });

  test('样例 docs/CAREER_SCHEMA.sample.json 符合契约', () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

    // 顶层键集合与顺序
    expect(Object.keys(sample)).toEqual(TOP_LEVEL_KEYS);

    // 每个用了 enum 的字段，取值都要在对应那一组的闭合集合里
    for (const e of ENUMS) {
      const values = collectSampleValues(sample, e.path);
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect(e.values).toContain(v);
    }

    // minItems >= 1 的字段在样例里数组非空
    for (const p of EXPECTED_MIN_ITEMS_PATHS) {
      const values = collectSampleValues(sample, p);
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) {
        expect(Array.isArray(v)).toBe(true);
        expect(v.length).toBeGreaterThan(0);
      }
    }

    // careerPhases 的 early/later 是非空字符串
    expect(typeof sample.careerPhases.early).toBe('string');
    expect(sample.careerPhases.early.length).toBeGreaterThan(0);
    expect(typeof sample.careerPhases.later).toBe('string');
    expect(sample.careerPhases.later.length).toBeGreaterThan(0);

    // timeline[].playbook 的取值必须是 playbooks[].scale 之一
    const scales = ENUMS.find((e) => e.path === 'playbooks[].scale').values;
    for (const t of sample.timeline) expect(scales).toContain(t.playbook);
  });

  test('机读契约块 JSON 语法错时抛中文错误而不是裸 SyntaxError', () => {
    const broken = ['```json', '{ "type": "object", }', '```', ''].join('\n');
    let caught = null;
    try {
      parseSchemaSource(broken);
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(SyntaxError);
    expect(caught.message).toMatch(/机读契约块不是合法 JSON/);
    // 保留原始 message 便于定位
    expect(caught.message.length).toBeGreaterThan('机读契约块不是合法 JSON'.length);
  });

  test('校验脚本能查出契约源两处枚举声明的漂移', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    // 当前源是同步的
    expect(validateEnums(sourceText)).toEqual([]);

    // 只改机读契约块里的 summary.strategy，人读表格不动 —— 校验脚本必须报出来
    const drifted = sourceText.replace(
      '"enum": ["主业重仓", "底盘待机", "守成缓投"]',
      '"enum": ["重仓", "底盘待机", "守成缓投"]',
    );
    expect(drifted).not.toBe(sourceText);   // 确认替换真的发生了
    const errors = validateEnums(drifted);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('summary.strategy');
  });
});
