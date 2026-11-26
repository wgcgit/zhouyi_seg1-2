'use strict';

const { computeInteractions } = require('../src/core/interactions');
const D = require('../src/core/derived');

/** 用四柱干支造一份 derived 桩 */
function stub(ganZhis, dayGan) {
  const keys = ['year', 'month', 'day', 'hour'];
  const out = {};
  keys.forEach((k, i) => {
    out[k] = D.derivePillar(ganZhis[i], dayGan, k === 'day');
  });
  return out;
}

describe('天干五合', () => {
  test('甲己合土', () => {
    const r = computeInteractions(stub(['甲午', '己未', '丙寅', '戊辰'], '甲'));
    expect(r.ganHe).toHaveLength(1);
    expect(r.ganHe[0]).toMatchObject({
      gan: '甲己', element: '土', fromCn: '年柱', toCn: '月柱',
    });
  });

  test('乙庚合金', () => {
    const r = computeInteractions(stub(['乙丑', '庚寅', '丙子', '戊戌'], '乙'));
    expect(r.ganHe[0]).toMatchObject({ gan: '乙庚', element: '金' });
  });

  test('丙辛合水', () => {
    const r = computeInteractions(stub(['丙子', '辛丑', '甲寅', '戊辰'], '甲'));
    expect(r.ganHe[0]).toMatchObject({ gan: '丙辛', element: '水' });
  });

  test('丁壬合木', () => {
    const r = computeInteractions(stub(['丁卯', '壬寅', '甲寅', '戊辰'], '甲'));
    expect(r.ganHe[0]).toMatchObject({ gan: '丁壬', element: '木' });
  });

  test('戊癸合火', () => {
    const r = computeInteractions(stub(['戊辰', '癸巳', '甲寅', '丙子'], '甲'));
    expect(r.ganHe[0]).toMatchObject({ gan: '戊癸', element: '火' });
  });

  test('不成合时为空', () => {
    // 甲、乙、丙、丁 两两之间均无五合关系（合者为 甲己/乙庚/丙辛/丁壬/戊癸）
    const r = computeInteractions(stub(['甲午', '乙丑', '丙寅', '丁卯'], '甲'));
    expect(r.ganHe).toHaveLength(0);
  });
});

describe('地支六合', () => {
  test('子丑合土', () => {
    const r = computeInteractions(stub(['甲子', '己丑', '丙寅', '戊辰'], '甲'));
    expect(r.zhiLiuHe).toHaveLength(1);
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '子丑', element: '土' });
  });

  test('寅亥合木', () => {
    const r = computeInteractions(stub(['甲寅', '乙亥', '丙子', '戊辰'], '甲'));
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '寅亥', element: '木' });
  });

  test('卯戌合火', () => {
    const r = computeInteractions(stub(['乙卯', '甲戌', '丙子', '戊辰'], '甲'));
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '卯戌', element: '火' });
  });

  test('辰酉合金', () => {
    const r = computeInteractions(stub(['甲辰', '癸酉', '丙子', '戊辰'], '甲'));
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '辰酉', element: '金' });
  });

  test('巳申合水', () => {
    const r = computeInteractions(stub(['乙巳', '壬申', '丙子', '戊辰'], '甲'));
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '巳申', element: '水' });
  });

  test('午未合土', () => {
    const r = computeInteractions(stub(['甲午', '辛未', '丙子', '戊辰'], '甲'));
    expect(r.zhiLiuHe[0]).toMatchObject({ zhi: '午未', element: '土' });
  });
});

describe('地支六冲', () => {
  test.each([
    ['子午', ['甲子', '庚午', '丙寅', '戊辰']],
    ['卯酉', ['乙卯', '癸酉', '丙子', '戊辰']],
    ['寅申', ['甲寅', '壬申', '丙子', '戊辰']],
    ['巳亥', ['乙巳', '己亥', '丙子', '戊辰']],
    ['辰戌', ['甲辰', '甲戌', '丙子', '戊辰']],
    ['丑未', ['乙丑', '辛未', '丙子', '戊辰']],
  ])('%s 相冲', (label, ganZhis) => {
    const r = computeInteractions(stub(ganZhis, '甲'));
    expect(r.zhiLiuChong.map(x => x.zhi)).toContain(label);
  });
});

describe('地支六穿（害）', () => {
  test.each([
    ['子未', ['甲子', '辛未', '丙寅', '戊辰']],
    ['丑午', ['乙丑', '庚午', '丙寅', '戊辰']],
    ['寅巳', ['甲寅', '乙巳', '丙子', '戊辰']],
    ['卯辰', ['乙卯', '甲辰', '丙子', '戊辰']],
    ['申亥', ['壬申', '己亥', '丙子', '戊辰']],
    ['酉戌', ['癸酉', '甲戌', '丙子', '戊辰']],
  ])('%s 相穿', (label, ganZhis) => {
    const r = computeInteractions(stub(ganZhis, '甲'));
    expect(r.zhiLiuChuan.map(x => x.zhi)).toContain(label);
  });
});

describe('地支相刑', () => {
  test('寅巳申：无恩之刑', () => {
    const r = computeInteractions(stub(['甲寅', '乙巳', '丙子', '丁卯'], '甲'));
    expect(r.zhiXing.map(x => x.zhi)).toContain('寅巳');
    expect(r.zhiXing.find(x => x.zhi === '寅巳').type).toBe('无恩之刑');
  });

  test('丑未戌：恃势之刑', () => {
    const r = computeInteractions(stub(['乙丑', '辛未', '丙子', '戊辰'], '甲'));
    expect(r.zhiXing.find(x => x.zhi === '丑未').type).toBe('恃势之刑');
  });

  test('子卯：无礼之刑', () => {
    const r = computeInteractions(stub(['甲子', '乙卯', '丙寅', '戊辰'], '甲'));
    expect(r.zhiXing.find(x => x.zhi === '子卯').type).toBe('无礼之刑');
  });

  test.each([
    ['辰', '戊辰', '庚辰'],
    ['午', '庚午', '壬午'],
    ['酉', '癸酉', '乙酉'],
    ['亥', '乙亥', '丁亥'],
  ])('%s 自刑', (zhi, gz1, gz2) => {
    const r = computeInteractions(stub([gz1, gz2, '丙子', '戊辰'], '甲'));
    expect(r.zhiXing.map(x => x.type)).toContain('自刑');
  });

  test('子午不刑', () => {
    const r = computeInteractions(stub(['甲子', '庚午', '丙寅', '戊辰'], '甲'));
    expect(r.zhiXing.map(x => x.zhi)).not.toContain('子午');
  });
});

describe('三合 / 三会 / 半合', () => {
  test('申子辰三合水局', () => {
    const r = computeInteractions(stub(['甲申', '丙子', '戊辰', '丁卯'], '甲'));
    expect(r.sanHe).toHaveLength(1);
    expect(r.sanHe[0]).toMatchObject({ element: '水', zhis: '申子辰' });
  });

  test('亥卯未三合木局', () => {
    const r = computeInteractions(stub(['乙亥', '辛卯', '己未', '丙子'], '甲'));
    expect(r.sanHe[0]).toMatchObject({ element: '木', zhis: '亥卯未' });
  });

  test('寅卯辰三会木方', () => {
    const r = computeInteractions(stub(['甲寅', '乙卯', '丙辰', '戊子'], '甲'));
    expect(r.sanHui).toHaveLength(1);
    expect(r.sanHui[0]).toMatchObject({ element: '木', zhis: '寅卯辰' });
  });

  test('申子半合（生地）', () => {
    const r = computeInteractions(stub(['甲申', '丙子', '戊寅', '乙丑'], '甲'));
    expect(r.banHe).toHaveLength(1);
    expect(r.banHe[0]).toMatchObject({ element: '水', subType: '生地半合', zhis: '申子' });
  });

  test('子辰半合（墓地）', () => {
    const r = computeInteractions(stub(['甲子', '戊辰', '丙寅', '乙丑'], '甲'));
    expect(r.banHe[0]).toMatchObject({ element: '水', subType: '墓地半合', zhis: '子辰' });
  });

  test('三支齐全时只算三合局，不重复算半合', () => {
    const r = computeInteractions(stub(['甲申', '丙子', '戊辰', '丁卯'], '甲'));
    expect(r.sanHe).toHaveLength(1);
    expect(r.banHe).toHaveLength(0);
  });
});

describe('伏吟', () => {
  test('年月日三柱同干支 → 记三对伏吟', () => {
    const r = computeInteractions(stub(['甲午', '甲午', '甲午', '乙巳'], '甲'));
    expect(r.fuYin).toHaveLength(3);
    expect(r.fuYin.every(x => x.ganZhi === '甲午')).toBe(true);
  });

  test('无相同柱则无伏吟', () => {
    const r = computeInteractions(stub(['甲午', '丙寅', '戊辰', '庚子'], '甲'));
    expect(r.fuYin).toHaveLength(0);
  });
});

describe('地支相破', () => {
  test.each([
    ['子酉', ['甲子', '癸酉', '丙寅', '戊辰']],
    ['卯午', ['乙卯', '庚午', '丙子', '戊辰']],
    ['丑辰', ['乙丑', '戊辰', '丙子', '辛未']],
  ])('%s 相破', (label, ganZhis) => {
    const r = computeInteractions(stub(ganZhis, '甲'));
    expect(r.zhiPo.map(x => x.zhi)).toContain(label);
  });
});
