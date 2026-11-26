'use strict';

const { computeStrength, relationTo, levelOf, levelLabel } = require('../src/analyze/strength');
const { computePattern } = require('../src/analyze/pattern');
const { buildChart } = require('../src/chart/build');
const D = require('../src/core/derived');
const C = require('../src/core/constants');

/**
 * 用四柱干支造一份 derived 桩。
 * 约定：日柱的天干必须是日主本身（与真实排盘一致）。
 */
function stub(ganZhis, dayGan) {
  const keys = ['year', 'month', 'day', 'hour'];
  const out = {};
  keys.forEach((k, i) => {
    out[k] = D.derivePillar(ganZhis[i], dayGan, k === 'day');
  });
  return out;
}

/**
 * 走真实排盘链路（四柱 → 派生 → 旺衰）造一份完整命盘。
 * 用于端到端锁住「非日柱同干 → 比肩 → 得势/得生」这条联动。
 */
function chart({ year, month, day, hour }) {
  return buildChart({
    name: '', gender: 'male', year, month, day, hour, minute: 0, second: 0,
    province: '北京市', city: '东城区',
  });
}

describe('五行打分：口径', () => {
  test('天干各记 1 分，地支按藏干权重拆分', () => {
    // 甲寅 乙卯 丙辰 丁巳，日主甲
    // 天干：甲木 乙木 丙火 丁火 → 木+2 火+2
    // 寅藏甲丙戊 0.6/0.3/0.1；卯藏乙 1.0；辰藏戊乙癸 0.6/0.3/0.1；巳藏丙庚戊 0.6/0.3/0.1
    const r = computeStrength(stub(['甲寅', '乙卯', '丙辰', '丁巳'], '甲'), '甲');
    expect(r.elementScores.木).toBeCloseTo(2 + 0.6 + 1 + 0.3, 6);
    expect(r.elementScores.火).toBeCloseTo(2 + 0.3 + 0.6, 6);
    expect(r.elementScores.土).toBeCloseTo(0.1 + 0.6 + 0.1, 6);
    expect(r.elementScores.金).toBeCloseTo(0.3, 6);
    expect(r.elementScores.水).toBeCloseTo(0.1, 6);
  });

  test('全部贡献加起来等于总分 8（4 天干 + 4 地支）', () => {
    const r = computeStrength(stub(['甲寅', '乙卯', '丙辰', '丁巳'], '甲'), '甲');
    const total = Object.values(r.elementScores).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(8, 6);
  });

  test('单藏地支记满 1 分', () => {
    const r = computeStrength(stub(['甲子', '乙丑', '丙寅', '丁卯'], '甲'), '甲');
    const ziHidden = r.contributions.find(
      c => c.pillar === 'year' && c.source === '地支藏干' && c.gan === '癸',
    );
    expect(ziHidden.score).toBe(1);
  });

  test('每个地支的藏干贡献之和恒为 1', () => {
    const r = computeStrength(stub(['甲寅', '乙卯', '丙辰', '丁巳'], '甲'), '甲');
    for (const pillar of ['year', 'month', 'day', 'hour']) {
      const sum = r.contributions
        .filter(c => c.pillar === pillar && c.source === '地支藏干')
        .reduce((s, c) => s + c.score, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

describe('五行分档阈值', () => {
  test.each([
    [0, 1, '极弱'], [0.4, 1, '极弱'],
    [0.5, 2, '偏弱'], [1.4, 2, '偏弱'],
    [1.5, 3, '中和'], [2.4, 3, '中和'],
    [2.5, 4, '偏旺'], [3.4, 4, '偏旺'],
    [3.5, 5, '极旺'], [9, 5, '极旺'],
  ])('分数 %s → %d 档 %s', (score, level, label) => {
    expect(levelOf(score)).toBe(level);
    expect(levelLabel(score)).toBe(label);
  });
});

describe('旺衰四要素', () => {
  test('得令：月令本气为比劫', () => {
    // 甲日，月支寅（甲本气 = 比肩）→ 得令
    const r = computeStrength(stub(['丙子', '甲寅', '甲子', '庚午'], '甲'), '甲');
    expect(r.factors.deLing.value).toBe(true);
    expect(r.factors.deLing.relation).toBe('比劫');
  });

  test('失令：月令本气为财', () => {
    // 甲日，月支辰（戊本气 = 土 = 偏财）→ 失令
    const r = computeStrength(stub(['庚午', '戊辰', '甲子', '丙寅'], '甲'), '甲');
    expect(r.factors.deLing.value).toBe(false);
    expect(r.factors.deLing.relation).toBe('财');
  });

  test('得地：日主在地支通根', () => {
    // 甲日，四支为子子子午，藏干无木 → 不得地
    const r = computeStrength(stub(['丙子', '戊子', '甲子', '庚午'], '甲'), '甲');
    expect(r.factors.deDi.value).toBe(false);
    expect(r.factors.deDi.roots).toHaveLength(0);
  });

  test('得地：日支为本气根', () => {
    // 甲日，日支寅藏甲（本气）→ 得地且有本气根
    const r = computeStrength(stub(['丙子', '戊子', '甲寅', '庚午'], '甲'), '甲');
    expect(r.factors.deDi.value).toBe(true);
    expect(r.factors.deDi.hasBenQiRoot).toBe(true);
  });

  test('得势：天干有比肩劫财或正偏印透出', () => {
    // 甲日，年干壬 = 偏印
    const r = computeStrength(stub(['壬子', '戊子', '甲子', '庚戌'], '甲'), '甲');
    expect(r.factors.deShi.value).toBe(true);
    expect(r.factors.deShi.helpers.some(h => h.gan === '壬')).toBe(true);
  });

  test('得生：印星所在柱未被合冲', () => {
    // 甲日，年干壬（偏印），年支子；四柱之间无冲无合 → 生助有效
    const r = computeStrength(stub(['壬子', '戊子', '甲子', '庚戌'], '甲'), '甲');
    expect(r.factors.deSheng.value).toBe(true);
    expect(r.factors.deSheng.effective.some(s => s.pillar === 'year')).toBe(true);
  });

  test('得生：印星所在柱被冲则受损', () => {
    // 甲日，年干壬（偏印），年支子；时支午与年支子相冲 → 生助受损
    const r = computeStrength(stub(['壬子', '戊子', '甲子', '庚午'], '甲'), '甲');
    const year = r.factors.deSheng.sources.find(s => s.pillar === 'year');
    expect(year.blocked).toBe(true);
  });
});

describe('十神与旺衰的联动：非日柱比肩', () => {
  test('得势能识别非日柱的比肩天干', () => {
    // 1950-01-01 08:00 男 北京 → 己丑 丙子 丙申 壬辰，日主丙
    // 月柱天干丙与日主同干 → 比肩，是透出生扶的信号
    const c = chart({ year: 1950, month: 1, day: 1, hour: 8 });
    expect(c.derived.month.ganShiShen).toBe('比肩');
    expect(c.strength.factors.deShi.value).toBe(true);
  });
});

describe('旺衰输出的留空字段', () => {
  test('dayMasterStrength 与 usefulGod 恒为 null', () => {
    const r = computeStrength(stub(['甲寅', '乙卯', '丙辰', '丁巳'], '甲'), '甲');
    expect(r.dayMasterStrength).toBeNull();
    expect(r.usefulGod).toBeNull();
  });

  test('有说明文字', () => {
    const r = computeStrength(stub(['甲寅', '乙卯', '丙辰', '丁巳'], '甲'), '甲');
    expect(typeof r.note).toBe('string');
    expect(r.note.length).toBeGreaterThan(0);
  });
});

describe('relationTo', () => {
  test.each([
    ['甲', '甲', '比劫'], ['甲', '乙', '比劫'],
    ['甲', '丙', '食伤'], ['甲', '丁', '食伤'],
    ['甲', '戊', '财'], ['甲', '己', '财'],
    ['甲', '庚', '官杀'], ['甲', '辛', '官杀'],
    ['甲', '壬', '印'], ['甲', '癸', '印'],
  ])('%s 对 %s 是 %s', (me, other, rel) => {
    expect(relationTo(me, other)).toBe(rel);
  });
});

describe('格局候选', () => {
  test('建禄格：月支为日主临官', () => {
    // 甲日禄在寅，月支寅 → 建禄格
    const r = computePattern(stub(['丙子', '甲寅', '甲子', '庚午'], '甲'), '甲');
    expect(r.candidates[0].name).toBe('建禄格');
    expect(r.candidates[0].category).toBe('比劫格');
    expect(r.candidates[0].confidence).toBe('high');
  });

  test('阳刃格：月支为日主帝旺', () => {
    // 庚日羊刃在酉，月支酉 → 阳刃格
    const r = computePattern(stub(['丙子', '丁酉', '庚子', '壬午'], '庚'), '庚');
    expect(r.candidates[0].name).toBe('阳刃格');
    expect(r.candidates[0].category).toBe('比劫格');
  });

  test('透干优先：月令藏干透于天干则取该十神格', () => {
    // 甲日，月支未藏己丁乙：己=正财（甲阳克己阴土）。年干透己 → 正财格且 high
    const r = computePattern(stub(['己未', '辛未', '甲子', '庚午'], '甲'), '甲');
    const zhengcai = r.candidates.find(c => c.name === '正财格');
    expect(zhengcai).toBeDefined();
    expect(zhengcai.confidence).toBe('high');
    expect(zhengcai.through).toContain('年柱');
  });

  test('未透干取本气为格，置信度 medium', () => {
    // 甲日，月支未藏己丁乙，年/月/时干均不透己
    const r = computePattern(stub(['丙子', '辛未', '甲子', '庚午'], '甲'), '甲');
    const zhengcai = r.candidates.find(c => c.name === '正财格');
    expect(zhengcai).toBeDefined();
    expect(zhengcai.confidence).toBe('medium');
    expect(zhengcai.through).toEqual([]);
  });

  test('杂气月会被标记', () => {
    // 月支辰属杂气月
    const r = computePattern(stub(['丙子', '戊辰', '甲子', '庚午'], '甲'), '甲');
    expect(r.isZaQiMonth).toBe(true);
  });

  test('finalPattern 恒为 null', () => {
    const r = computePattern(stub(['丙子', '甲寅', '甲子', '庚午'], '甲'), '甲');
    expect(r.finalPattern).toBeNull();
  });

  test('候选按 high → medium → low 排序', () => {
    // 甲日，月支辰：戊(偏财, 本气, 未透→medium)、乙(劫财, 跳过)、癸(正印, 余气, 未透→low)
    const r = computePattern(stub(['丙子', '壬辰', '甲子', '庚午'], '甲'), '甲');
    const order = { high: 0, medium: 1, low: 2 };
    const seq = r.candidates.map(c => order[c.confidence]);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(seq.length).toBeGreaterThanOrEqual(2);
  });
});
