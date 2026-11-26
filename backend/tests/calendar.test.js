'use strict';

const { trueSolarTime, equationOfTime, dayOfYearOf } = require('../src/calendar/true-solar-time');
const { isChinaDST, utcOffsetHours } = require('../src/calendar/dst');

describe('均时差：Spencer 近似式', () => {
  // 权威参考值（分钟），来自公开天文年表
  const CASES = [
    ['2024-02-11', -14.2],
    ['2024-05-14', 3.7],
    ['2024-07-26', -6.4],
    ['2024-11-03', 16.4],
  ];

  test.each(CASES)('%s 均时差 ≈ %s 分钟（容差 ±0.6 分钟）', (date, expected) => {
    const [y, m, d] = date.split('-').map(Number);
    const got = equationOfTime(y, m, d);
    expect(Math.abs(got - expected)).toBeLessThanOrEqual(0.6);
  });

  test('一年中的第几天', () => {
    expect(dayOfYearOf(2024, 1, 1)).toBe(1);
    expect(dayOfYearOf(2023, 12, 31)).toBe(365);
    expect(dayOfYearOf(2024, 12, 31)).toBe(366);   // 闰年
    expect(dayOfYearOf(2000, 3, 1)).toBe(61);      // 2000 也是闰年
  });
});

describe('中国夏令时（1986–1991）', () => {
  const CASES = [
    ['1986-05-04', 3, true],
    ['1986-05-04', 1, false],
    ['1986-09-14', 1, true],
    ['1986-09-14', 2, false],
    ['1987-04-12', 3, true],
    ['1987-04-12', 1, false],
    ['1988-04-10', 3, true],
    ['1989-04-16', 3, true],
    ['1990-04-15', 3, true],
    ['1991-04-14', 3, true],
    ['1991-09-15', 1, true],
    ['1991-09-15', 2, false],
    ['1985-07-01', 12, false],   // 1985 没夏令时
    ['1992-07-01', 12, false],   // 1992 起取消
    ['2000-07-01', 12, false],
  ];

  test.each(CASES)('%s %d 点 → 夏令时 %s', (date, hour, expected) => {
    expect(isChinaDST(date, hour)).toBe(expected);
  });

  test('UTC 偏移：夏令时期间为 +9，其余为 +8', () => {
    expect(utcOffsetHours('1990-05-15', 10)).toBe(9);
    expect(utcOffsetHours('1990-12-01', 10)).toBe(8);
  });
});

describe('真太阳时校正', () => {
  test('北京（东经 116.418）：经度校正为负，均时差为正', () => {
    const r = trueSolarTime({
      year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0, longitude: 116.418,
    });
    expect(r.longitudeCorrectionMinutes).toBeCloseTo((116.418 - 120) * 4, 6);
    expect(r.equationOfTimeMinutes).toBeCloseTo(3.7562, 3);
  });

  test('乌鲁木齐（东经 87.62）：比北京晚约 2 小时', () => {
    const r = trueSolarTime({
      year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0, longitude: 87.62,
    });
    expect(r.longitudeCorrectionMinutes).toBeCloseTo((87.62 - 120) * 4, 6);
    expect(r.longitudeCorrectionMinutes).toBeLessThan(-120);
  });

  test('夏令时期间：挂钟先拨回标准时一小时', () => {
    const dst = trueSolarTime({
      year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0, longitude: 120,
    });
    const std = trueSolarTime({
      year: 1990, month: 12, day: 15, hour: 10, minute: 30, second: 0, longitude: 120,
    });
    expect(dst.dstOffsetHours).toBe(1);
    expect(std.dstOffsetHours).toBe(0);
    // 东经 120° 时经度校正为 0，两次真太阳时差正好 1 小时（均时差另有小差）
    expect(dst.beijingTotalMinutes).toBe(std.beijingTotalMinutes - 60);
  });

  test('日期进位：新疆凌晨 0 点会退到前一天', () => {
    const r = trueSolarTime({
      year: 2000, month: 1, day: 1, hour: 0, minute: 30, second: 0, longitude: 87.62,
    });
    expect(r.trueSolar.year).toBe(1999);
    expect(r.trueSolar.month).toBe(12);
    expect(r.trueSolar.day).toBe(31);
  });

  test('日期不变：北京时间中午前后仍在本日', () => {
    const r = trueSolarTime({
      year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0, longitude: 121.47,
    });
    expect(r.trueSolar.year).toBe(2000);
    expect(r.trueSolar.month).toBe(1);
    expect(r.trueSolar.day).toBe(1);
  });
});
