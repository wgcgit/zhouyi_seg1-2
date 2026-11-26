'use strict';

// 入参校验的回归测试：非法日期、数组值、类型与长度限制。
// 本产品不移植解读层（无 /api/interpret），所以这里只测 /api/paipan 一条路由。
// 「两个路由的校验等价性」在 Task 8 由 session.test.js 接手（/api/paipan vs /api/session）。

const request = require('supertest');
const { createApp } = require('../src/app');

const VALID = {
  name: '张三', gender: 'male',
  year: 1990, month: 5, day: 15,
  hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

const BAD_DATES = [
  { label: '2024 年 2 月 31 日', body: { year: 2024, month: 2, day: 31 } },
  { label: '4 月 31 日', body: { month: 4, day: 31 } },
  { label: '6 月 31 日', body: { month: 6, day: 31 } },
  { label: '平年 2023 年 2 月 29 日', body: { year: 2023, month: 2, day: 29 } },
];

describe('非法日期必须被 400 拦掉', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  for (const c of BAD_DATES) {
    test(`paipan 路由：${c.label} 返回 400 与中文错误`, async () => {
      const res = await request(app).post('/api/paipan/chart').send({ ...VALID, ...c.body });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0]).toMatch(/[一-龥]/);
    });
  }

  test('闰年 2024 年 2 月 29 日是合法日期，paipan 放得过', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, year: 2024, month: 2, day: 29 });
    expect(res.status).toBe(200);
  });
});

describe('数组 / 对象 / 布尔值不得蒙混过关', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  const BAD_YEARS = [
    { label: '数组', value: [1990] },
    { label: '布尔', value: true },
    { label: '对象', value: { year: 1990 } },
  ];

  for (const b of BAD_YEARS) {
    test(`year 为${b.label}时 paipan 返回 400`, async () => {
      const res = await request(app).post('/api/paipan/chart').send({ ...VALID, year: b.value });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatch(/[一-龥]/);
    });
  }

  test('month 为数组时同样被拦掉', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, month: [5] });
    expect(res.status).toBe(400);
  });

  test('day 为数组时同样被拦掉', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, day: [15] });
    expect(res.status).toBe(400);
  });
});

describe('姓名与省市的类型、长度限制（B-4）', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  test('超长 name 被 400 拦掉且错误是中文', async () => {
    const long33 = '张三'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: long33 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
  });

  test('超长 province 被 400 拦掉', async () => {
    const long33 = '北京'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, province: long33 });
    expect(res.status).toBe(400);
  });

  test('超长 city 被 400 拦掉', async () => {
    const long33 = '东城'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, city: long33 });
    expect(res.status).toBe(400);
  });

  test('name 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: 123 });
    expect(res.status).toBe(400);
  });

  test('province 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, province: 123 });
    expect(res.status).toBe(400);
  });

  test('city 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, city: 123 });
    expect(res.status).toBe(400);
  });

  test('长度恰好 32 的 name 放得过', async () => {
    const name32 = '张'.repeat(32);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: name32 });
    expect(res.status).toBe(200);
  });
});
