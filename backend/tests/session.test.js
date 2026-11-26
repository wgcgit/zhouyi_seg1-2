'use strict';

const request = require('supertest');

jest.mock('../src/career/run', () => ({
  runCareerRounds: jest.fn(),
}));

const { runCareerRounds } = require('../src/career/run');
const { createApp } = require('../src/app');

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 1, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

describe('会话编排', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    runCareerRounds.mockResolvedValue({
      data: { case: { gender: '男' } },
      prose: '## 策略总纲\n底盘待机',
      parsed: true,
      defects: [],
    });
  });

  test('提交后返回 202，并带回排盘结果', async () => {
    const res = await request(app).post('/api/session').send(VALID_BODY);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.status).toBe('pending');
    expect(res.body.chart.pillars.year).toBeTruthy();
  });

  test('参数非法时返回 400 与中文错误', async () => {
    const res = await request(app).post('/api/session').send({ ...VALID_BODY, year: 1800 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/year/);
  });

  test('轮询状态会从 pending 变成 ready', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    // 等后台任务跑完
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    expect(res.body.status).toBe('ready');
  });

  test('可以取回排盘结果与事业推理结果', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await new Promise((r) => setTimeout(r, 50));

    const chart = await request(app).get(`/api/session/${id}/chart`);
    expect(chart.body.chart.pillars.day).toBeTruthy();

    const career = await request(app).get(`/api/session/${id}/career`);
    expect(career.body.career.prose).toContain('底盘待机');
    expect(career.body.career.json).toBeTruthy();
  });

  test('阶段二失败时状态是 error，且带中文提示', async () => {
    runCareerRounds.mockResolvedValue({
      data: null, prose: '', parsed: true, defects: ['缺 directions'],
    });
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toBeTruthy();
  });

  test('会话不存在时返回 404 与中文错误', async () => {
    // 用纯 ASCII 的假 id —— 会话 id 里带中文会让 superagent 抛
    // 「Request path contains unescaped characters」，测的就不是 404 逻辑了。
    const res = await request(app).get('/api/session/no-such-session/status');
    expect(res.status).toBe(404);
    expect(res.body.errors[0]).toMatch(/不存在/);
  });

  test('可以追加与读取对话历史', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await request(app)
      .post(`/api/session/${id}/history`)
      .send({ role: 'user', content: '我适合做什么行业？' });
    const res = await request(app).get(`/api/session/${id}/history`);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].content).toBe('我适合做什么行业？');
  });

  test('解读层的路由已不存在', async () => {
    const res = await request(app).post('/api/interpret').send(VALID_BODY);
    expect(res.status).toBe(404);
  });

  // 「两个路由的校验等价性」在 Task 1 的 input-validation.test.js 里被删掉了
  // （那时 /api/interpret 已被摘除，基线是 paipan vs interpret）。
  // 本产品的等价基准换成 paipan vs session —— 在这里补上。
  test('paipan 与 session 对同一份非法输入给出的 errors 完全一致', async () => {
    const BAD_CASES = [
      { label: '2 月 31 日', body: { year: 2024, month: 2, day: 31 } },
      { label: 'year 为数组', body: { year: [1990] } },
      { label: '缺少 province/city', body: { province: '', city: '' } },
      { label: 'gender 无法识别', body: { gender: 'x' } },
    ];
    for (const c of BAD_CASES) {
      const paipanRes = await request(app).post('/api/paipan/chart').send({ ...VALID_BODY, ...c.body });
      const sessionRes = await request(app).post('/api/session').send({ ...VALID_BODY, ...c.body });
      expect(paipanRes.status).toBe(400);
      expect(sessionRes.status).toBe(400);
      expect(sessionRes.body.errors).toEqual(paipanRes.body.errors);
    }
  });
});
