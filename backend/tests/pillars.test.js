'use strict';

const { computeChart } = require('../src/core/pillars');

/**
 * 方案文档 §2.6 的四个实测校验样例。
 * 这些样例用 lunar-python 算出，v2 用 lunar-javascript（同一作者、同一套节气表）复现。
 *
 * 注意：样例按「直接用钟表时排盘」计算，不含真太阳时校正，
 * 因此这里显式关掉 trueSolarTime。
 */
const SAMPLES = [
  {
    name: '样例1 1986-05-29 00:00',
    input: { year: 1986, month: 5, day: 29, hour: 0, minute: 0, second: 0 },
    expect: { year: '丙寅', month: '癸巳', day: '癸酉', hour: '壬子' },
  },
  {
    name: '样例2 1990-05-15 10:30',
    input: { year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0 },
    expect: { year: '庚午', month: '辛巳', day: '庚辰', hour: '辛巳' },
  },
  {
    name: '样例3 2000-01-01 12:00',
    input: { year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0 },
    expect: { year: '己卯', month: '丙子', day: '戊午', hour: '戊午' },
  },
  {
    name: '样例4 2024-02-04 16:27（立春前 7 秒）',
    input: { year: 2024, month: 2, day: 4, hour: 16, minute: 27, second: 0 },
    expect: { year: '癸卯', month: '乙丑', day: '戊戌', hour: '庚申' },
  },
];

describe('四柱：方案文档 §2.6 实测校验样例', () => {
  const geo = { province: '北京市', city: '东城区' };

  for (const s of SAMPLES) {
    test(s.name, () => {
      const chart = computeChart(
        { name: '测试', gender: 'male', ...s.input, ...geo },
        { trueSolarTime: false },
      );
      expect(chart.pillars).toEqual(s.expect);
    });
  }
});

describe('四柱：立春换年边界', () => {
  const geo = { province: '北京市', city: '东城区' };
  const base = { name: '测试', gender: 'male', month: 2, day: 4, minute: 0, second: 0, ...geo };

  test('2024 立春交节 16:27:07 —— 16:27 仍属癸卯年乙丑月', () => {
    const chart = computeChart({ ...base, year: 2024, hour: 16 }, { trueSolarTime: false });
    expect(chart.pillars.year).toBe('癸卯');
    expect(chart.pillars.month).toBe('乙丑');
  });

  test('2024 立春交节 16:27:07 —— 16:28 已换甲辰年丙寅月', () => {
    const chart = computeChart({ ...base, year: 2024, hour: 16, minute: 28 }, { trueSolarTime: false });
    expect(chart.pillars.year).toBe('甲辰');
    expect(chart.pillars.month).toBe('丙寅');
  });
});

describe('四柱：23:00 换日边界（流派开关）', () => {
  const geo = { province: '北京市', city: '东城区' };
  const base = { name: '测试', gender: 'male', year: 1975, month: 2, day: 24, minute: 30, second: 0, ...geo };

  test('dayBoundary=1（23:00 换日）：23:30 算次日日柱', () => {
    const chart = computeChart({ ...base, hour: 23 }, { trueSolarTime: false, dayBoundary: 1 });
    expect(chart.pillars.day).toBe('壬寅');
  });

  test('dayBoundary=2（00:00 换日）：23:30 仍算当日日柱', () => {
    const chart = computeChart({ ...base, hour: 23 }, { trueSolarTime: false, dayBoundary: 2 });
    expect(chart.pillars.day).toBe('辛丑');
  });

  test('dayBoundary=1：当日正午不受影响', () => {
    const chart = computeChart(
      { ...base, hour: 12, minute: 0 }, { trueSolarTime: false, dayBoundary: 1 },
    );
    expect(chart.pillars.day).toBe('辛丑');
  });
});

describe('四柱：日柱连续性（相邻日期六十甲子推进）', () => {
  const geo = { province: '北京市', city: '东城区' };
  // 从 2000-01-01 起连续 61 天
  const dayAt = (n) => {
    const d = new Date(Date.UTC(2000, 0, 1 + n));
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    };
  };

  test('连续 60 天日柱不重复且第 61 天回到起点', () => {
    const seen = new Set();
    let first = null;
    for (let n = 0; n < 60; n++) {
      const { year, month, day } = dayAt(n);
      const chart = computeChart(
        { name: 't', gender: 'male', year, month, day, hour: 12, minute: 0, second: 0, ...geo },
        { trueSolarTime: false },
      );
      if (n === 0) first = chart.pillars.day;
      seen.add(chart.pillars.day);
    }
    expect(seen.size).toBe(60);

    const { year, month, day } = dayAt(60);
    const chart61 = computeChart(
      { name: 't', gender: 'male', year, month, day, hour: 12, minute: 0, second: 0, ...geo },
      { trueSolarTime: false },
    );
    expect(chart61.pillars.day).toBe(first);
  });
});
