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
});
