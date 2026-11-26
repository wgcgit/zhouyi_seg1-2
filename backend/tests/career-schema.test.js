'use strict';

const fs = require('fs');
const path = require('path');
const { parseSchemaSource, TOP_LEVEL_KEYS, ENUMS, MACHINE_SCHEMA } = require('../src/career/schema');
const { validateGenerated } = require('../scripts/validate-career-schema');
const { buildSchemaMarkdown } = require('../scripts/build-career-schema');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const GENERATED_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');

const EXPECTED_KEYS = [
  'case', 'monthCommand', 'pattern', 'patternTracks', 'careerPhases', 'tiaoHou',
  'xiJi', 'boundaries', 'directions', 'playbooks', 'timeline', 'transition', 'summary',
];

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
