'use strict';

const request = require('supertest');

// 必须同时 mock career/run：否则 session 路由会真的去跑阶段二，
// 而 client 被 mock 后拿不到合法 JSON，session 永远是 error 状态，
// 下面的「回答原样返回」等测试全会拿到 409 而不是 200。
jest.mock('../src/career/run', () => ({
  runCareerRounds: jest.fn(),
}));

jest.mock('../src/llm/client', () => ({
  callMiniMax: jest.fn(),
  parseLLMJson: jest.fn(),
  friendlyError: jest.fn((e) => String(e && e.message)),
}));

const { runCareerRounds } = require('../src/career/run');
const client = require('../src/llm/client');
const { createApp } = require('../src/app');

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 1, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

/** 建一个 ready 状态的会话 */
async function makeReadySession(app) {
  const created = await request(app).post('/api/session').send(VALID_BODY);
  const id = created.body.sessionId;
  await new Promise((r) => setTimeout(r, 50));
  return id;
}

describe('chat 问答', () => {
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
    client.callMiniMax.mockResolvedValue('宜向北发展，水运是黄金阶段。');
    // friendlyError 恢复成「翻译不了的错误原样返回英文 message」的真实行为，
    // 免得某条测试用 mockReturnValue 改了它之后漏给后面的用例。
    client.friendlyError.mockImplementation((e) => String(e && e.message));
  });

  test('回答原样返回', async () => {
    const id = await makeReadySession(app);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: id, message: '我适合做什么行业？' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('宜向北发展，水运是黄金阶段。');
  });

  test('问题会写进会话历史', async () => {
    const id = await makeReadySession(app);
    await request(app).post('/api/chat').send({ sessionId: id, message: '我适合做什么行业？' });
    const hist = await request(app).get(`/api/session/${id}/history`);
    expect(hist.body.history.map((h) => h.content)).toContain('我适合做什么行业？');
  });

  test('会话不存在时返回 404', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: '不存在', message: '你好' });
    expect(res.status).toBe(404);
    // 断言文案本身：chat 路由自己的 404 文案是「会话不存在或已过期」，
    // 而 express 全局兜底（路由压根没匹配上）的文案是「请求的接口不存在」。
    // 只断言状态码 404 分不清这两者，必须把文案也钉住。
    expect(res.body.errors[0]).toContain('会话不存在');
    // 会话不存在时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('缺少会话编号时返回 400', async () => {
    const res = await request(app).post('/api/chat').send({ message: '我适合做什么行业？' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toContain('会话');
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
    // 缺会话编号时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('消息为空时返回 400', async () => {
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '  ' });
    expect(res.status).toBe(400);
  });

  test('会话还在推理中时返回 409', async () => {
    // 让阶段二永远不结束，session 停在 pending
    runCareerRounds.mockImplementation(() => new Promise(() => {}));
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: created.body.sessionId, message: '你好' });
    expect(res.status).toBe(409);
  });

  test('模型报错时返回 500 与中文提示', async () => {
    // 故意让 friendlyError 返回**英文原文**：
    // 这样测的才是 chat 路由自己的中文兜底（chineseError）真的挡住了英文外泄，
    // 而不是被 mock 里的翻译顺手遮住了。
    client.friendlyError.mockReturnValue('timeout of 300000ms exceeded');
    client.callMiniMax.mockRejectedValue(new Error('timeout of 300000ms exceeded'));
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '你好' });
    expect(res.status).toBe(500);
    expect(res.body.errors[0]).toMatch(/./);
    // 必须是中文提示
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
    // 英文原文一律不许外泄
    expect(res.body.errors[0]).not.toMatch(/timeout/i);
    expect(res.body.errors[0]).not.toMatch(/exceeded/i);
  });

  test('模型返回空内容时返回 500 与中文提示', async () => {
    client.callMiniMax.mockResolvedValue('   ');
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '你好' });
    expect(res.status).toBe(500);
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
  });

  test('一次 chat 后该提问只出现一次', async () => {
    // 钉住顺序：组装 prompt 用的是「旧历史 + 本次提问」，
    // 拿到答案之后才把本轮问答写回历史。
    // 如果先 push 再组装 prompt，同一条提问会出现两遍。
    const id = await makeReadySession(app);
    const question = '我适合做什么行业？';
    await request(app).post('/api/chat').send({ sessionId: id, message: question });

    // 1) 组装给模型的 prompt 里，这条提问只出现一次
    const messages = client.callMiniMax.mock.calls[0][0];
    const userContent = messages.find((m) => m.role === 'user').content;
    expect(userContent.split(question).length - 1).toBe(1);

    // 2) 写回历史后，这条提问也只出现一次
    const hist = await request(app).get(`/api/session/${id}/history`);
    const userHits = hist.body.history.filter(
      (h) => h.role === 'user' && h.content === question,
    );
    expect(userHits.length).toBe(1);
  });
});
