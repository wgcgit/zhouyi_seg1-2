'use strict';

const fs = require('fs');
const path = require('path');
const { renderCareerProse, groupTimelineByType, BRANCHES_BY_TYPE } = require('../src/career/render');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

function clone(o) { return JSON.parse(JSON.stringify(o)); }

describe('事业推理结果渲染成散文', () => {
  test('输出的段落顺序与契约键序一致', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    // 锚点用**实际渲染出来的小标题**（render.js 的 SECTION_TITLES 拼出来的原文）。
    // 注意：喜忌是一段（标题「## 喜忌」），月令与格局合并成一段（标题「## 月令与格局」）。
    const anchors = [
      '## 八字命例', '## 月令与格局', '## 格局赛道', '## 事业阶段', '## 调候',
      '## 喜忌', '## 边界', '## 方位与行业', '## 打法', '## 大运',
      '## 交运', '## 策略总纲',
    ];
    let cursor = -1;
    for (const a of anchors) {
      const at = prose.indexOf(a, cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test('喜忌段里喜、次喜、忌三项都渲染出来了', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('喜：水（印）、木（比劫）');
    expect(prose).toContain('次喜：丙火');
    expect(prose).toContain('忌：叠土、叠金');
  });

  test('没有 JSON 键名残留在散文里', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    for (const key of ['monthCommand', 'patternTracks', 'careerPhases', 'liunianWindows', 'mainTrack']) {
      expect(prose).not.toContain(key);
    }
  });

  test('四柱出现在开头', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('戊辰');
    expect(prose).toContain('己未');
    expect(prose).toContain('乙亥');
    expect(prose).toContain('乙酉');
  });

  test('月令与格局合并成一段', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('财星当令，财多身难独担');
    expect(prose).toContain('辰为水库，未为燥土财库，双库夹局');
  });

  test('事业阶段段照抄 early 与 later', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('早年财杀混杂，多奔波、多试错、换赛道、平台辗转');
    expect(prose).toContain('中年后若大运引水印、中年以后家资成就');
  });

  test('打法四档都出现', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    for (const s of ['早期', '轻创业', '重资产', '合伙']) {
      expect(prose).toContain(s);
    }
  });

  test('大运按五行类型分组，括注地支集', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('水运（亥、子）');
  });

  test('流年窗口也渲染出来（散文比 txt 多出的内容）', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('2033');
    expect(prose).toContain('透出调候用神');
  });

  test('BRANCHES_BY_TYPE 覆盖 5 种运', () => {
    expect(Object.keys(BRANCHES_BY_TYPE).sort()).toEqual(['土运', '水运', '木运', '火运', '金运'].sort());
    expect(BRANCHES_BY_TYPE['水运']).toBe('亥、子');
    expect(BRANCHES_BY_TYPE['金运']).toBe('申、酉');
  });

  test('groupTimelineByType 把同类型的相邻大运归到一组', () => {
    const groups = groupTimelineByType([
      { ganZhi: '癸亥', type: '水运' },
      { ganZhi: '甲子', type: '水运' },
      { ganZhi: '乙丑', type: '土运' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('水运');
    expect(groups[0].steps).toHaveLength(2);
    expect(groups[1].type).toBe('土运');
  });

  test('相邻不同类型的分开成组', () => {
    const groups = groupTimelineByType([
      { ganZhi: '癸亥', type: '水运' },
      { ganZhi: '乙丑', type: '土运' },
      { ganZhi: '丙寅', type: '木运' },
    ]);
    expect(groups.map((g) => g.type)).toEqual(['水运', '土运', '木运']);
  });

  test('空 timeline 不炸', () => {
    const d = clone(SAMPLE);
    d.timeline = [];
    expect(() => renderCareerProse(d)).not.toThrow();
  });

  // ---- 控制方补充第 1 条：早年/中年后前缀重复的处理 ----

  test('样例自带「早年」「中年后」前缀时不重复加标签', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).not.toContain('早年：早年');
    expect(prose).not.toContain('中年后：中年后');
    // 原文仍需完整出现
    expect(prose).toContain('早年财杀混杂，多奔波、多试错、换赛道、平台辗转');
    expect(prose).toContain('中年后若大运引水印、中年以后家资成就');
  });

  test('early / later 不自带前缀时仍加标签，且不出现「：：」', () => {
    const d = clone(SAMPLE);
    d.careerPhases = { early: '起步阶段多试错', later: '中年转型期需要取舍' };
    const prose = renderCareerProse(d);
    expect(prose).toContain('早年：起步阶段多试错');
    expect(prose).toContain('中年转型期需要取舍');
    expect(prose).not.toContain('：：');
    expect(prose).not.toContain('：\n');
  });

  // ---- 复审 Important 1：分组结果要带 branches ----

  test('分组结果带 branches，等于 BRANCHES_BY_TYPE 里该类型的值', () => {
    const groups = groupTimelineByType([{ type: '水运', ganZhi: '癸亥' }]);
    expect(groups[0]).toHaveProperty('branches');
    expect(groups[0].branches).toBe(BRANCHES_BY_TYPE['水运']);
  });

  test('BRANCHES_BY_TYPE 里每一种运，分组结果都带得上对应的 branches', () => {
    const types = Object.keys(BRANCHES_BY_TYPE);
    expect(types).toHaveLength(5);
    for (const type of types) {
      const groups = groupTimelineByType([{ type, ganZhi: '干支' }]);
      expect(groups).toHaveLength(1);
      expect(groups[0].branches).toBe(BRANCHES_BY_TYPE[type]);
    }
  });

  // ---- 复审 Important 2：「相邻」语义要钉住（非相邻的同类型不能并组） ----

  test('非相邻的同类型不并组：水、土、水 分成三组', () => {
    const groups = groupTimelineByType([
      { type: '水运', ganZhi: '癸亥' },
      { type: '土运', ganZhi: '乙丑' },
      { type: '水运', ganZhi: '丙寅' },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].type).toBe('水运');
    expect(groups[1].type).toBe('土运');
    expect(groups[2].type).toBe('水运');
  });

  // ---- 复审 Important 3：顶层 null 与数组字段类型不对都不能抛异常 ----

  test('顶层是 null / undefined / 空对象时都不抛异常', () => {
    expect(() => renderCareerProse(null)).not.toThrow();
    expect(typeof renderCareerProse(null)).toBe('string');
    expect(() => renderCareerProse(undefined)).not.toThrow();
    expect(typeof renderCareerProse(undefined)).toBe('string');
    expect(() => renderCareerProse({})).not.toThrow();
    expect(typeof renderCareerProse({})).toBe('string');
  });

  test('数组字段类型不对（string / number）时都不抛异常，输出里也没有 [object Object]', () => {
    const patches = [
      { xiJi: '水（印）' },
      { xiJi: 42 },
      { patternTracks: '不动产' },
      { summary: { strategy: '底盘待机', notes: '喜水木，忌叠土叠金' } },
      { boundaries: 5 },
      { directions: 5 },
      { playbooks: 5 },
      { timeline: 5 },
    ];
    for (const patch of patches) {
      const d = clone(SAMPLE);
      Object.assign(d, patch);
      let prose = '';
      expect(() => { prose = renderCareerProse(d); }).not.toThrow();
      expect(prose).not.toContain('[object Object]');
    }
  });

  // ---- 复审测试补强：渲染内容缺失要有人管 ----

  test('策略总纲的 notes 内容渲染出来了', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('喜水木，忌叠土叠金');
  });

  test('大运段渲染了 mainTrack 的值，但没有 mainTrack 这个键名', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('深耕专业、铺底盘');
    expect(prose).not.toContain('mainTrack');
  });

  test('事业阶段的 early 段在 later 段之前', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    const earlyAt = prose.indexOf('早年财杀混杂');
    const laterAt = prose.indexOf('中年后若大运引水印');
    expect(earlyAt).toBeGreaterThan(-1);
    expect(laterAt).toBeGreaterThan(-1);
    expect(earlyAt).toBeLessThan(laterAt);
  });

  test('契约里全部键名在散文里零泄漏（键名从契约源解析，不在测试里写死）', () => {
    const { MACHINE_SCHEMA } = require('../src/career/schema');
    const keys = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.properties) {
        for (const k of Object.keys(node.properties)) {
          keys.push(k);
          walk(node.properties[k]);
        }
      }
      if (node.items) walk(node.items);
    })(MACHINE_SCHEMA);
    // 机读契约块里一共 72 处键名（去重后 62 个）。契约变了这条会响，属于有意的绊线。
    expect(keys).toHaveLength(72);
    expect(new Set(keys).size).toBe(62);
    const prose = renderCareerProse(clone(SAMPLE));
    for (const k of keys) {
      expect(prose).not.toContain(k);
    }
  });
});
