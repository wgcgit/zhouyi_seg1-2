'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { CONTRACT_FIELDS } = require('../src/chart/build');

const app = createApp();

const VALID = {
  name: '张三',
  gender: 'male',
  year: 1990, month: 5, day: 15,
  hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

describe('GET /api/health', () => {
  test('返回服务信息', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('zhouyi-v2-offline');
  });
});

describe('GET /health', () => {
  // 部署平台的探活可能打 /health，少了这个路由会在部署时被判成启动失败。
  test('返回与 /api/health 相同的服务信息', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('zhouyi-v2-offline');
    const alias = await request(app).get('/api/health');
    expect(res.body).toEqual(alias.body);
  });
});

describe('POST /api/paipan/chart', () => {
  test('返回完整命盘 JSON', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const chart = res.body.data;
    for (const f of CONTRACT_FIELDS) {
      expect(chart).toHaveProperty(f);
    }
    expect(chart.pillars.year).toBe('庚午');
    expect(chart.dayMaster.gan).toBe('庚');
  });

  test('默认开启真太阳时', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    expect(res.body.data.settings.trueSolarTime).toBe(true);
  });

  test('默认关闭换日方式（00:00 换日）', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    expect(res.body.data.settings.dayBoundary).toBe('00:00 换日');
  });

  test('显式指定 dayBoundary=1 时仍按 23:00 换日', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, dayBoundary: 1 });
    expect(res.body.data.settings.dayBoundary).toBe('23:00 换日');
  });

  test('显式关闭真太阳时后用钟表时排盘', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, trueSolarTime: false });
    expect(res.body.data.settings.trueSolarTime).toBe(false);
    expect(res.body.data.input.birthClockTime).toBe('1990-05-15 10:30:00');
  });

  test('记录了时间校正明细', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    const adj = res.body.data.input.timeAdjustments;
    expect(adj).toHaveProperty('dstOffsetHours');
    expect(adj).toHaveProperty('longitudeCorrectionMinutes');
    expect(adj).toHaveProperty('equationOfTimeMinutes');
  });

  test('缺字段返回 400 与中文错误说明', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ gender: 'male' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors.join('')).toMatch(/year|province|city/);
  });

  test('性别非法返回 400', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, gender: 'other' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join('')).toMatch(/gender/);
  });

  test('城市不存在返回 400', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, province: '不存在省', city: '不存在市' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('月份越界返回 400', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, month: 13 });
    expect(res.status).toBe(400);
  });

  test('性别支持中文写法', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, gender: '女' });
    expect(res.status).toBe(200);
    expect(res.body.data.input.gender).toBe('女');
  });
});

describe('错误处理：提示一律中文', () => {
  test('请求体不是合法 JSON 时返回 400 与中文错误', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
    for (const e of res.body.errors) {
      expect(e).toMatch(/[一-龥]/);
    }
    // 不能把第三方库的英文原文透给用户
    expect(res.body.errors.join('')).not.toMatch(/JSON at position|Unexpected token/);
  });

  test('未知路由返回中文 404 而不是英文 HTML', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
    for (const e of res.body.errors) {
      expect(e).toMatch(/[一-龥]/);
    }
    expect(res.text).not.toMatch(/Cannot GET/);
  });
});

describe('GET /api/paipan/cities', () => {
  test('返回 437 个城市与计数', async () => {
    const res = await request(app).get('/api/paipan/cities');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(437);
    expect(res.body.cities).toHaveLength(437);
  });
});

describe('GET /api/paipan/schema', () => {
  test('返回契约字段清单', async () => {
    const res = await request(app).get('/api/paipan/schema');
    expect(res.status).toBe(200);
    expect(res.body.fields).toEqual(CONTRACT_FIELDS);
  });
});

describe('命盘契约：留空字段', () => {
  test('dayMasterStrength / usefulGod / finalPattern 恒为 null', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    const chart = res.body.data;
    expect(chart.strength.dayMasterStrength).toBeNull();
    expect(chart.strength.usefulGod).toBeNull();
    expect(chart.pattern.finalPattern).toBeNull();
  });

  test('meta 标注引擎与 schema 版本', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    expect(res.body.data.meta.schemaVersion).toBe('1.0');
    expect(res.body.data.meta.engine).toBe('zhouyi-v2-offline');
    expect(res.body.data.meta.lunarLibrary).toContain('lunar-javascript');
  });

  test('大运与流年都在结果里', async () => {
    const res = await request(app).post('/api/paipan/chart').send(VALID);
    expect(res.body.data.fortune.dayun.length).toBeGreaterThan(0);
    expect(res.body.data.fortune.liunian).toHaveLength(100);
  });
});
