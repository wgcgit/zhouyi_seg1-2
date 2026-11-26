'use strict';

const { computeShenSha } = require('../src/core/shensha');
const D = require('../src/core/derived');
const C = require('../src/core/constants');

/** 取某个地支对应的第一个合法干支（保证落在六十甲子内） */
function gz(zhi) {
  return C.JIA_ZI.find(j => j[1] === zhi);
}

/** 用四柱干支造一份 derived 桩 */
function stub(ganZhis, dayGan) {
  const keys = ['year', 'month', 'day', 'hour'];
  const out = {};
  keys.forEach((k, i) => {
    out[k] = D.derivePillar(ganZhis[i], dayGan, k === 'day');
  });
  return out;
}

describe('天乙贵人', () => {
  test('甲日：丑为贵人', () => {
    const r = computeShenSha(stub([gz('子'), gz('丑'), gz('寅'), gz('卯')], '甲'), '甲');
    expect(r.tianYiGuiRen.map(x => x.zhi)).toContain('丑');
  });

  test('甲日：未为贵人', () => {
    const r = computeShenSha(stub([gz('子'), gz('未'), gz('寅'), gz('卯')], '甲'), '甲');
    expect(r.tianYiGuiRen.map(x => x.zhi)).toContain('未');
  });

  test('乙日：子为贵人', () => {
    const r = computeShenSha(stub([gz('子'), gz('申'), gz('寅'), gz('卯')], '乙'), '乙');
    expect(r.tianYiGuiRen.map(x => x.zhi)).toContain('子');
  });

  test('乙日：申为贵人', () => {
    const r = computeShenSha(stub([gz('子'), gz('申'), gz('寅'), gz('卯')], '乙'), '乙');
    expect(r.tianYiGuiRen.map(x => x.zhi)).toContain('申');
  });

  test('日干与年干两路查到同一柱时只记一次，日干优先', () => {
    // 年干甲、日干甲，甲的贵人位是丑未；丑柱两路都命中，只保留一条
    const r = computeShenSha(stub([gz('子'), gz('丑'), gz('寅'), gz('卯')], '甲'), '甲');
    const inMonth = r.tianYiGuiRen.filter(x => x.pillar === 'month');
    expect(inMonth).toHaveLength(1);
    expect(inMonth[0].basedOn).toBe('日干');
  });
});

describe('禄神', () => {
  test.each([
    ['甲', '寅'], ['乙', '卯'], ['丙', '巳'], ['丁', '午'], ['戊', '巳'],
    ['己', '午'], ['庚', '申'], ['辛', '酉'], ['壬', '亥'], ['癸', '子'],
  ])('%s 日主禄在 %s', (gan, zhi) => {
    const r = computeShenSha(
      stub([gz('子'), gz(zhi), gz('辰'), gz('午')], gan), gan,
    );
    expect(r.luShen.map(x => x.zhi)).toContain(zhi);
    expect(r.luShen[0].basedOn).toBe('日干');
  });
});

describe('羊刃', () => {
  test.each([
    ['甲', '卯'], ['乙', '辰'], ['丙', '午'], ['丁', '未'], ['戊', '午'],
    ['己', '未'], ['庚', '酉'], ['辛', '戌'], ['壬', '子'], ['癸', '丑'],
  ])('%s 日主羊刃在 %s', (gan, zhi) => {
    const r = computeShenSha(
      stub([gz('子'), gz(zhi), gz('辰'), gz('午')], gan), gan,
    );
    expect(r.yangRen.map(x => x.zhi)).toContain(zhi);
  });
});

describe('文昌', () => {
  test.each([
    ['甲', '巳'], ['乙', '午'], ['丙', '申'], ['丁', '酉'], ['戊', '申'],
    ['己', '酉'], ['庚', '亥'], ['辛', '子'], ['壬', '寅'], ['癸', '卯'],
  ])('%s 日主文昌在 %s', (gan, zhi) => {
    const r = computeShenSha(
      stub([gz('子'), gz(zhi), gz('辰'), gz('午')], gan), gan,
    );
    expect(r.wenChang.map(x => x.zhi)).toContain(zhi);
  });
});

describe('桃花', () => {
  test('寅午戌局：桃花在卯', () => {
    const r = computeShenSha(stub([gz('寅'), gz('午'), gz('子'), gz('卯')], '甲'), '甲');
    expect(r.taoHua.map(x => x.zhi)).toContain('卯');
  });

  test('申子辰局：桃花在酉', () => {
    const r = computeShenSha(stub([gz('申'), gz('子'), gz('辰'), gz('酉')], '甲'), '甲');
    expect(r.taoHua.map(x => x.zhi)).toContain('酉');
  });

  test('亥卯未局：桃花在子', () => {
    const r = computeShenSha(stub([gz('亥'), gz('未'), gz('子'), gz('巳')], '甲'), '甲');
    expect(r.taoHua.map(x => x.zhi)).toContain('子');
  });
});

describe('驿马', () => {
  test('寅午戌局：驿马在申', () => {
    const r = computeShenSha(stub([gz('寅'), gz('午'), gz('申'), gz('卯')], '甲'), '甲');
    expect(r.yiMa.map(x => x.zhi)).toContain('申');
  });

  test('申子辰局：驿马在寅', () => {
    const r = computeShenSha(stub([gz('申'), gz('子'), gz('寅'), gz('酉')], '甲'), '甲');
    expect(r.yiMa.map(x => x.zhi)).toContain('寅');
  });

  test('亥卯未局：驿马在巳', () => {
    const r = computeShenSha(stub([gz('亥'), gz('未'), gz('子'), gz('巳')], '甲'), '甲');
    expect(r.yiMa.map(x => x.zhi)).toContain('巳');
  });
});

describe('华盖', () => {
  test('寅午戌局：华盖在戌', () => {
    const r = computeShenSha(stub([gz('寅'), gz('戌'), gz('子'), gz('卯')], '甲'), '甲');
    expect(r.huaGai.map(x => x.zhi)).toContain('戌');
  });

  test('申子辰局：华盖在辰', () => {
    const r = computeShenSha(stub([gz('申'), gz('子'), gz('辰'), gz('酉')], '甲'), '甲');
    expect(r.huaGai.map(x => x.zhi)).toContain('辰');
  });

  test('亥卯未局：华盖在未', () => {
    const r = computeShenSha(stub([gz('亥'), gz('未'), gz('子'), gz('巳')], '甲'), '甲');
    expect(r.huaGai.map(x => x.zhi)).toContain('未');
  });
});

describe('神煞去重', () => {
  test('年支与日支同局时同一柱的桃花只记一次', () => {
    // 年支申、日支辰同属申子辰局，两路的桃花都在酉；酉柱只记一条
    const r = computeShenSha(stub([gz('申'), gz('子'), gz('辰'), gz('酉')], '甲'), '甲');
    const atYou = r.taoHua.filter(x => x.zhi === '酉');
    expect(atYou).toHaveLength(1);
    expect(atYou[0].basedOn).toBe('年支');
  });

  test('年支与日支同局时同一柱的华盖只记一次', () => {
    const r = computeShenSha(stub([gz('申'), gz('子'), gz('辰'), gz('酉')], '甲'), '甲');
    expect(r.huaGai.filter(x => x.zhi === '辰')).toHaveLength(1);
  });
});

describe('神煞结果的结构', () => {
  test('每条记录都带柱位与依据', () => {
    const r = computeShenSha(stub([gz('寅'), gz('午'), gz('申'), gz('卯')], '甲'), '甲');
    for (const list of Object.values(r)) {
      for (const item of list) {
        expect(item).toHaveProperty('pillar');
        expect(item).toHaveProperty('pillarCn');
        expect(item).toHaveProperty('zhi');
        expect(item).toHaveProperty('basedOn');
      }
    }
  });

  test('所有神煞键固定为 7 个', () => {
    const r = computeShenSha(stub([gz('寅'), gz('午'), gz('申'), gz('卯')], '甲'), '甲');
    expect(Object.keys(r).sort()).toEqual([
      'huaGai', 'luShen', 'taoHua', 'tianYiGuiRen', 'wenChang', 'yangRen', 'yiMa',
    ]);
  });
});
