'use strict';

const crypto = require('crypto');
const { computeChart } = require('../src/core/pillars');
const { computeFortune, yearGanZhi, liuYueGanZhi, liuRiGanZhi } = require('../src/fortune/dayun');

const GEO = { province: '北京市', city: '东城区' };

function chart(input, options = {}) {
  return computeChart(
    { name: '测试', gender: 'male', ...GEO, ...input },
    { trueSolarTime: false, ...options },
  );
}

/** 方案文档 §6.2 的算例：男，1990-03-18 08:15，年柱庚午（阳年）→ 顺排 */
const DOC_SAMPLE = { year: 1990, month: 3, day: 18, hour: 8, minute: 15, second: 0 };

describe('大运方向：看年干阴阳，不看日干', () => {
  test('阳年男顺排', () => {
    const c = chart({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0 });
    const f = computeFortune(c);
    expect(f.forward).toBe(true);
    expect(f.direction).toBe('顺排');
    expect(f.directionReason).toBe('阳男顺排');
  });

  test('阳年女逆排', () => {
    const c = chart({
      year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0, gender: 'female',
    });
    const f = computeFortune(c);
    expect(f.forward).toBe(false);
    expect(f.directionReason).toBe('阳女逆排');
  });

  test('阴年男逆排', () => {
    // 1999 己卯年，年干己为阴，男 → 逆排
    const c = chart({ year: 1999, month: 5, day: 15, hour: 10, minute: 30, second: 0 });
    const f = computeFortune(c);
    expect(f.forward).toBe(false);
    expect(f.directionReason).toBe('阴男逆排');
  });

  test('阴年女顺排', () => {
    const c = chart({
      year: 1999, month: 5, day: 15, hour: 10, minute: 30, second: 0, gender: 'female',
    });
    const f = computeFortune(c);
    expect(f.forward).toBe(true);
    expect(f.directionReason).toBe('阴女顺排');
  });
});

describe('起运：数到的是「节」不是「中气」', () => {
  test('方案文档 §6.2 算例：1990-03-18 08:15 男，顺排起运 6 年 0 月 10 天', () => {
    const c = chart(DOC_SAMPLE);
    const f = computeFortune(c);
    expect(f.forward).toBe(true);
    expect(f.startAge).toEqual({ year: 6, month: 0, day: 10, hour: 0 });
    expect(f.startDate).toBe('1996-03-28');
    expect(f.method).toBe('三天折一岁（1天=4月，1时辰=10天）');
  });

  test('顺排第一步是月柱干支的下一个干支', () => {
    const c = chart(DOC_SAMPLE);
    const f = computeFortune(c);
    expect(c.pillars.month).toBe('己卯');
    expect(f.dayun[1].ganZhi).toBe('庚辰');
  });

  test('起运数的是下一个「节」（清明），不是中气（春分）', () => {
    // 1990-03-18 之后最近的节是清明（约 04-05）；春分（03-20）是中气，不换月不计运
    // 若误数到春分，起运约 0 岁 9 个月；正确数到清明是 6 岁 0 个月 10 天
    const c = chart(DOC_SAMPLE);
    const f = computeFortune(c);
    expect(f.startAge.year).toBe(6);
    expect(f.startAge.month).toBe(0);
  });

  test('精确分钟折算是另一种口径', () => {
    const c = chart(DOC_SAMPLE);
    const f = computeFortune(c, { qiyunMethod: 2 });
    expect(f.method).toBe('精确分钟折算（4320分钟=1年）');
    expect(f.startAge.year).toBeGreaterThan(0);
  });
});

describe('大运序列结构', () => {
  const c = chart(DOC_SAMPLE);
  const f = computeFortune(c);

  test('第 0 步为空运（出生到起运前）', () => {
    expect(f.dayun[0].isPrefixed).toBe(true);
    expect(f.dayun[0].ganZhi).toBeNull();
    expect(f.dayun[0].startAge).toBe(1);
  });

  test('每步大运跨 10 年', () => {
    for (const d of f.dayun.slice(1)) {
      expect(d.endYear - d.startYear).toBe(9);
      expect(d.endAge - d.startAge).toBe(9);
    }
  });

  test('大运干支首尾相接、无空档无重叠', () => {
    for (let i = 2; i < f.dayun.length; i++) {
      expect(f.dayun[i].startYear).toBe(f.dayun[i - 1].endYear + 1);
    }
  });

  test('每步大运带十神、十二长生、纳音', () => {
    const d = f.dayun[1];
    expect(typeof d.ganShiShen).toBe('string');
    expect(typeof d.changSheng).toBe('string');
    expect(typeof d.naYin).toBe('string');
  });

  test('至少 8 步大运', () => {
    expect(f.dayun.length).toBeGreaterThanOrEqual(9);
  });
});

describe('流年', () => {
  const c = chart(DOC_SAMPLE);
  const f = computeFortune(c);

  test('共 100 年，从出生年起', () => {
    expect(f.liunian).toHaveLength(100);
    expect(f.liunian[0].year).toBe(1990);
    expect(f.liunian[99].year).toBe(2089);
  });

  test('虚岁从 1 起', () => {
    expect(f.liunian[0].age).toBe(1);
    expect(f.liunian[10].age).toBe(11);
  });

  test('流年干支按立春换年', () => {
    expect(f.liunian[0].ganZhi).toBe('庚午');
    expect(f.liunian[1].ganZhi).toBe('辛未');
  });

  test('本命年：流年地支与年支相同，每 12 年一次', () => {
    const benming = f.liunian.filter(x => x.benMingNian);
    expect(benming.length).toBeGreaterThanOrEqual(8);
    for (const x of benming) expect(x.zhi).toBe('午');
    // 相邻本命年相差 12 年
    for (let i = 1; i < benming.length; i++) {
      expect(benming[i].year - benming[i - 1].year).toBe(12);
    }
  });

  test('冲太岁：流年地支与日支相冲', () => {
    // 日柱壬午，日支午；午冲子 → 子年冲太岁
    const chong = f.liunian.filter(x => x.chongTaiSui);
    expect(chong.length).toBeGreaterThan(0);
    for (const x of chong) expect(x.zhi).toBe('子');
  });

  test('流年归属到正确的大运', () => {
    const y2008 = f.liunian.find(x => x.year === 2008);
    expect(y2008.dayunGanZhi).toBe('辛巳');
    expect(y2008.dayunIndex).toBe(2);
  });
});

describe('年柱干支：立春换年', () => {
  test('1984 年与 2024 年的年柱', () => {
    expect(yearGanZhi(1984)).toBe('甲子');
    expect(yearGanZhi(2024)).toBe('甲辰');
  });

  test('连续 60 年年柱不重复', () => {
    const seen = new Set();
    for (let y = 2000; y < 2060; y++) seen.add(yearGanZhi(y));
    expect(seen.size).toBe(60);
  });
});

describe('流年与大运的虚岁基准必须同源（A-1）', () => {
  /** 大运表 + 流年表对齐性：每条流年行的虚岁必须等于它所属大运步的 startAge + (年份 - 该步 startYear) */
  function assertAligned(f) {
    for (const row of f.liunian) {
      if (row.dayunIndex === null) continue;   // 落在所有大运步之外的年份没有可对齐的步
      const step = f.dayun[row.dayunIndex];
      expect(row.age).toBe(step.startAge + (row.year - step.startYear));
    }
  }

  /** 流年表的全部字段快照（每一行、每一个字段） */
  function snapshot(f) {
    return f.liunian.map(r => [
      r.year, r.ganZhi, r.gan, r.zhi, r.ganShiShen, r.changSheng,
      r.age, r.dayunIndex, r.dayunGanZhi, r.chongTaiSui, r.benMingNian,
    ]);
  }

  /** 快照的摘要：任一行的任一字段变了摘要就变 */
  function digest(f) {
    return crypto.createHash('sha256').update(JSON.stringify(snapshot(f))).digest('hex');
  }

  const URUMQI = { province: '新疆维吾尔自治区', city: '乌鲁木齐市' };
  const BEIJING = { year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0 };

  test('对齐性：真太阳时关闭的普通盘', () => {
    assertAligned(computeFortune(chart(DOC_SAMPLE)));
  });

  test('对齐性：北京 1990-05-15 10:30（真太阳时开启）', () => {
    const c = computeChart(
      { name: '测试', gender: 'male', ...GEO, ...BEIJING },
      { trueSolarTime: true },
    );
    assertAligned(computeFortune(c));
  });

  test('对齐性：乌鲁木齐 1990-01-01 01:00（真太阳时开启，校正后落到 1989 年）', () => {
    const c = computeChart(
      { name: '测试', gender: 'male', ...URUMQI, year: 1990, month: 1, day: 1, hour: 1, minute: 0, second: 0 },
      { trueSolarTime: true },
    );
    assertAligned(computeFortune(c));
  });

  test('不回归：真太阳时关闭时流年表每一行每一个字段都不变', () => {
    const f = computeFortune(chart(DOC_SAMPLE));
    expect(f.liunian).toHaveLength(100);
    expect(snapshot(f)[0]).toEqual([1990, '庚午', '庚', '午', '偏印', '胎', 1, 0, null, false, true]);
    expect(snapshot(f)[1]).toEqual([1991, '辛未', '辛', '未', '正印', '养', 2, 0, null, false, false]);
    expect(snapshot(f)[50]).toEqual([2040, '庚申', '庚', '申', '偏印', '长生', 51, 5, '甲申', false, false]);
    expect(snapshot(f)[99]).toEqual([2089, '己酉', '己', '酉', '正官', '沐浴', 100, null, null, false, false]);
    expect(digest(f)).toBe('9c2e467e57d5b3b2537e9294e37e9109af90e03c39972c44f4021d6d51527c18');
  });

  test('不回归：北京 1990-05-15 10:30（真太阳时开启，校正后年份不变）流年表每一行每一个字段都不变', () => {
    const c = computeChart(
      { name: '测试', gender: 'male', ...GEO, ...BEIJING },
      { trueSolarTime: true },
    );
    const f = computeFortune(c);
    expect(f.liunian).toHaveLength(100);
    expect(snapshot(f)[0]).toEqual([1990, '庚午', '庚', '午', '比肩', '沐浴', 1, 0, null, false, true]);
    expect(snapshot(f)[99]).toEqual([2089, '己酉', '己', '酉', '正印', '帝旺', 100, null, null, false, false]);
    expect(digest(f)).toBe('57cdc89cef021902b783269a1039e1903a0fbe8bb6e373f631fa793d0368b48b');
  });

  test('新增回归用例：乌鲁木齐 1990-01-01 01:00 真太阳时开启 → 首行是 1989 己巳、虚岁 1、本命年', () => {
    const c = computeChart(
      { name: '测试', gender: 'male', ...URUMQI, year: 1990, month: 1, day: 1, hour: 1, minute: 0, second: 0 },
      { trueSolarTime: true },
    );
    const f = computeFortune(c);
    // 真太阳时校正到 1989-12-31，年柱属 1989 年（己巳）
    expect(c.pillars.year).toBe('己巳');
    expect(f.liunian[0].year).toBe(1989);
    expect(f.liunian[0].ganZhi).toBe('己巳');
    expect(f.liunian[0].age).toBe(1);
    expect(f.liunian[0].benMingNian).toBe(true);
    // 第 1 行、第 2 行的虚岁与所属大运步对得上
    expect(f.liunian[1].age).toBe(f.dayun[f.liunian[1].dayunIndex].startAge
      + (f.liunian[1].year - f.dayun[f.liunian[1].dayunIndex].startYear));
    expect(f.liunian[2].age).toBe(f.dayun[f.liunian[2].dayunIndex].startAge
      + (f.liunian[2].year - f.dayun[f.liunian[2].dayunIndex].startYear));
  });

  test('与 lunar-javascript 自己的流年（年份 + 虚岁）逐年一致', () => {
    for (const c of [
      chart(DOC_SAMPLE),
      computeChart(
        { name: '测试', gender: 'male', ...URUMQI, year: 1990, month: 1, day: 1, hour: 1, minute: 0, second: 0 },
        { trueSolarTime: true },
      ),
    ]) {
      const f = computeFortune(c);
      // 库里的大运与流年用的是同一个基准（lunar.js 的 buildDaYun / buildLiuNian）
      const yun = c._ec.getYun(c.input.gender === 'male' ? 1 : 0, 1);
      const libAges = new Map();
      for (const dy of yun.getDaYun()) {
        for (const ln of dy.getLiuNian(dy.getIndex() === 0 ? dy.getEndYear() - dy.getStartYear() + 1 : 10)) {
          libAges.set(ln.getYear(), ln.getAge());
        }
      }
      expect(libAges.size).toBeGreaterThan(0);
      for (const [year, age] of libAges) {
        const row = f.liunian.find(r => r.year === year);
        expect(row).toBeDefined();
        expect(row.age).toBe(age);
      }
    }
  });
});

describe('流月：五虎遁', () => {
  test('甲己之年丙作首 —— 甲年（2024 甲辰）寅月为丙寅', () => {
    expect(liuYueGanZhi(2024, 0)).toBe('丙寅');
  });

  test('乙庚之年戊为头 —— 乙年（2025 乙巳）寅月为戊寅', () => {
    expect(liuYueGanZhi(2025, 0)).toBe('戊寅');
  });

  test('丙辛之年庚寅 —— 丙年（2026 丙午）寅月为庚寅', () => {
    expect(liuYueGanZhi(2026, 0)).toBe('庚寅');
  });

  test('丁壬之年壬寅 —— 丁年（2027 丁未）寅月为壬寅', () => {
    expect(liuYueGanZhi(2027, 0)).toBe('壬寅');
  });

  test('戊癸之年甲寅 —— 戊年（2028 戊申）寅月为甲寅', () => {
    expect(liuYueGanZhi(2028, 0)).toBe('甲寅');
  });

  test('己年（2029 己酉）仍以丙寅起', () => {
    expect(liuYueGanZhi(2029, 0)).toBe('丙寅');
  });

  test('十二月从寅月起，十二月为丑', () => {
    expect(liuYueGanZhi(2024, 0)).toBe('丙寅');
    expect(liuYueGanZhi(2024, 1)).toBe('丁卯');
    expect(liuYueGanZhi(2024, 10)).toBe('丙子');
    expect(liuYueGanZhi(2024, 11)).toBe('丁丑');
  });
});

describe('流日', () => {
  test('与日柱同制：连续两日相差一位', () => {
    const a = liuRiGanZhi(2024, 5, 1);
    const b = liuRiGanZhi(2024, 5, 2);
    expect(a).not.toBe(b);
  });

  test('2024-05-01 的日柱', () => {
    expect(liuRiGanZhi(2024, 5, 1)).toBe('乙丑');
  });
});

describe('流月：与 lunar-javascript 自己的流月交叉校验（D-6）', () => {
  // liuYueGanZhi 是全项目唯一手写的历法推导（五虎遁表 [2,4,6,8,0]）。
  // 手写表一旦和库不一致，没有任何运行时调用方会发现 ——
  // 所以这里用库自己的流月（Yun → DaYun → LiuNian → LiuYue）逐年核对。
  const { Solar, EightChar } = require('lunar-javascript');
  const ec = EightChar.fromLunar(Solar.fromYmdHms(1990, 5, 15, 10, 30, 0).getLunar());
  const yun = ec.getYun(1, 1);

  test('2024–2029 每一年、每一月的流月干支都与库完全相等', () => {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2029]) {
      const step = yun.getDaYun().find(d => y >= d.getStartYear() && y <= d.getEndYear());
      expect(step).toBeDefined();
      const ln = step.getLiuNian(step.getEndYear() - step.getStartYear() + 1)
        .find(x => x.getYear() === y);
      expect(ln).toBeDefined();
      const libLiuYue = ln.getLiuYue().map(x => x.getGanZhi());
      const mine = Array.from({ length: 12 }, (_, i) => liuYueGanZhi(y, i));
      expect(mine).toEqual(libLiuYue);
    }
  });
});
