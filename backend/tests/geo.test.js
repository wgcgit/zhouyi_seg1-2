'use strict';

const { lookupCoords, listAllKeys, CITY_COUNT } = require('../src/geo');

describe('城市经纬度表', () => {
  test('覆盖 437 个城市', () => {
    expect(CITY_COUNT).toBe(437);
    expect(listAllKeys()).toHaveLength(437);
  });

  test('键的格式是「省|市」', () => {
    for (const k of listAllKeys()) {
      expect(k).toMatch(/^[^|]+\|[^|]+$/);
    }
  });

  test('每条记录的经纬度都在合法范围内', () => {
    for (const k of listAllKeys()) {
      const [province, city] = k.split('|');
      const c = lookupCoords(province, city);
      expect(c).not.toBeNull();
      expect(c.lng).toBeGreaterThanOrEqual(73);
      expect(c.lng).toBeLessThanOrEqual(135);
      expect(c.lat).toBeGreaterThanOrEqual(3);
      expect(c.lat).toBeLessThanOrEqual(54);
    }
  });

  test('每条记录都标注了来源', () => {
    for (const k of listAllKeys()) {
      const [province, city] = k.split('|');
      const c = lookupCoords(province, city);
      expect(typeof c.how).toBe('string');
      expect(c.how.length).toBeGreaterThan(0);
    }
  });

  test('已知城市的经纬度正确', () => {
    const beijing = lookupCoords('北京市', '东城区');
    expect(beijing.lng).toBeCloseTo(116.42, 1);
    expect(beijing.lat).toBeCloseTo(39.92, 1);

    const urumqi = lookupCoords('新疆维吾尔自治区', '乌鲁木齐市');
    expect(urumqi.lng).toBeCloseTo(87.62, 1);
    expect(urumqi.lat).toBeCloseTo(43.83, 1);

    const harbin = lookupCoords('黑龙江省', '哈尔滨市');
    expect(harbin.lng).toBeCloseTo(126.62, 1);
  });

  test('查不到时返回 null', () => {
    expect(lookupCoords('不存在省', '不存在市')).toBeNull();
    expect(lookupCoords('北京市', '不存在区')).toBeNull();
  });

  test('直辖市与特别行政区的区县级条目都在', () => {
    expect(lookupCoords('北京市', '东城区')).not.toBeNull();
    expect(lookupCoords('上海市', '浦东新区')).not.toBeNull();
    expect(lookupCoords('香港特别行政区', '香港岛')).not.toBeNull();
    expect(lookupCoords('澳门特别行政区', '澳门半岛')).not.toBeNull();
  });
});
