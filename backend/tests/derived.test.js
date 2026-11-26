'use strict';

const { LunarUtil } = require('lunar-javascript');
const D = require('../src/core/derived');
const C = require('../src/core/constants');

describe('十神：全 100 组与 lunar-javascript 逐一比对', () => {
  test('全部一致', () => {
    const mismatches = [];
    for (const me of C.GAN) {
      for (const ot of C.GAN) {
        const mine = D.tenGod(me, ot);
        const lib = LunarUtil.SHI_SHEN[me + ot];
        if (mine !== lib) mismatches.push(`${me}${ot}: ${mine} ≠ ${lib}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('地支藏干：全 12 地支与 lunar-javascript 逐一比对', () => {
  test('全部一致', () => {
    const mismatches = [];
    for (const z of C.ZHI) {
      const mine = D.hiddenStems(z).map(h => h.gan).join(',');
      const lib = LunarUtil.ZHI_HIDE_GAN[z].join(',');
      if (mine !== lib) mismatches.push(`${z}: ${mine} ≠ ${lib}`);
    }
    expect(mismatches).toEqual([]);
  });

  test('藏干权重之和恒为 1', () => {
    for (const z of C.ZHI) {
      const sum = D.hiddenStems(z).reduce((s, h) => s + h.weight, 0);
      expect(Number(sum.toFixed(6))).toBe(1);
    }
  });
});

describe('十二长生：全 10 日主 × 12 地支与 lunar-javascript 逐一比对', () => {
  /** 库语义：index = CHANG_SHENG_OFFSET[gan] + (阳 ? zhiIndex : -zhiIndex) */
  function libChangSheng(gan, zhi) {
    const offset = LunarUtil.CHANG_SHENG_OFFSET[gan];
    const yang = C.GAN.indexOf(gan) % 2 === 0;
    const z0 = C.ZHI.indexOf(zhi);
    let index = offset + (yang ? z0 : -z0);
    if (index >= 12) index -= 12;
    if (index < 0) index += 12;
    return LunarUtil.CHANG_SHENG[index];
  }

  test('全部一致', () => {
    const mismatches = [];
    for (const g of C.GAN) {
      for (const z of C.ZHI) {
        const mine = D.changSheng(g, z);
        const lib = libChangSheng(g, z);
        if (mine !== lib) mismatches.push(`${g}${z}: ${mine} ≠ ${lib}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('甲木长生在亥、帝旺在卯（口诀抽验）', () => {
    expect(D.changSheng('甲', '亥')).toBe('长生');
    expect(D.changSheng('甲', '卯')).toBe('帝旺');
    expect(D.changSheng('庚', '酉')).toBe('帝旺');
    expect(D.changSheng('癸', '卯')).toBe('长生');
  });
});

describe('纳音：全 60 组与 lunar-javascript 逐一比对', () => {
  test('全部一致', () => {
    const mismatches = [];
    for (const jz of C.JIA_ZI) {
      const mine = D.naYin(jz);
      const lib = LunarUtil.NAYIN[jz];
      if (mine !== lib) mismatches.push(`${jz}: ${mine} ≠ ${lib}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('空亡：全 60 组与 lunar-javascript 逐一比对', () => {
  test('全部一致', () => {
    const mismatches = [];
    for (const jz of C.JIA_ZI) {
      const mine = D.xunKong(jz).join('');
      const lib = LunarUtil.getXunKong(jz);
      if (mine !== lib) mismatches.push(`${jz}: ${mine} ≠ ${lib}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('derivePillar：一柱的完整派生', () => {
  const p = D.derivePillar('庚午', '庚');

  test('天干地支与五行阴阳', () => {
    expect(p.gan).toBe('庚');
    expect(p.zhi).toBe('午');
    expect(p.ganElement).toBe('金');
    expect(p.zhiElement).toBe('火');
    expect(p.ganYinYang).toBe('阳');
    expect(p.zhiYinYang).toBe('阳');
  });

  test('日干自身无十神', () => {
    expect(p.ganShiShen).toBeNull();
  });

  test('藏干带十神、角色与权重', () => {
    // 日主庚（阳金）：午中丁火克庚为官杀，丁阴庚阳 → 正官；己土生庚为印，己阴庚阳 → 正印
    expect(p.hiddenStems).toEqual([
      { gan: '丁', element: '火', role: '本气', weight: 0.7, shiShen: '正官' },
      { gan: '己', element: '土', role: '中气', weight: 0.3, shiShen: '正印' },
    ]);
  });

  test('纳音、空亡、十二长生', () => {
    expect(p.naYin).toBe('路旁土');
    expect(p.xunKong).toEqual(['戌', '亥']);
    expect(p.changSheng).toBe('沐浴');
  });
});

describe('十神标注：同干不再误伤', () => {
  test('非日柱的天干与日主同干时，十神是比肩而不是 null', () => {
    const p = D.derivePillar('庚午', '庚', false);   // 非日柱
    expect(p.ganShiShen).toBe('比肩');
  });

  test('日柱自己的天干仍然没有十神', () => {
    const p = D.derivePillar('庚午', '庚', true);
    expect(p.ganShiShen).toBeNull();
  });

  test('藏干与日主同干时，十神是比肩而不是 null', () => {
    // 日主乙，卯中藏乙为比肩
    const p = D.derivePillar('乙卯', '乙', true);
    expect(p.hiddenStems[0].shiShen).toBe('比肩');
  });

  test('所有藏干的十神都非空', () => {
    for (const gz of ['甲子', '乙丑', '丙寅', '丁卯', '戊辰', '己巳', '庚午', '辛未', '壬申', '癸酉']) {
      for (const h of D.derivePillar(gz, '甲').hiddenStems) {
        expect(typeof h.shiShen).toBe('string');
        expect(h.shiShen.length).toBeGreaterThan(0);
      }
    }
  });
});
