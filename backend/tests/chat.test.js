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

/**
 * 直接往会话表里塞一个指定状态的会话。
 *
 * 阶段二跑挂时的会话（status='error'）没法靠 mock runCareerRounds 造出来
 * （它只在拿到非法 JSON 时才置 error），所以这里直接写会话表，
 * 这样 status / error 文案都是确定的，断言才钉得住。
 */
function putSession(app, patch) {
  const id = 'sess_test_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  app.locals.sessions.set(id, {
    id,
    status: 'pending',
    createdAt: Date.now(),
    chart: null,
    career: null,
    error: null,
    history: [],
    ...patch,
  });
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

  test('模型返回的首尾空白会被去掉', async () => {
    // 钉住 chat 路由里的 raw.trim()：
    // 之前「回答原样返回」用的 mock 值没有首尾空白，把 trim() 删掉测试照样绿。
    client.callMiniMax.mockResolvedValue('  回答内容  ');
    const id = await makeReadySession(app);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: id, message: '我适合做什么行业？' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('回答内容');
  });

  test('system prompt 里同时带上 JSON 段、散文段与通用方法论', async () => {
    // 造一个「探针只出现在 JSON 里」的会话：
    // JSON 段与散文段的内容互不相同，两条断言才不会互相蒙混过关。
    runCareerRounds.mockResolvedValue({
      data: { marker: '只出现在JSON里的探针' },
      prose: '只出现在散文里的探针',
      parsed: true,
      defects: [],
    });
    const id = await makeReadySession(app);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: id, message: '我适合做什么行业？' });
    expect(res.status).toBe(200);

    const messages = client.callMiniMax.mock.calls[0][0];
    const system = messages.find((m) => m.role === 'system').content;

    // 1) JSON 段：标题 + json 围栏 + 只在 JSON 里出现的探针
    expect(system).toContain('## 本命事业推理结果（JSON）');
    expect(system).toContain('```json');
    expect(system).toContain('只出现在JSON里的探针');

    // 2) 散文段：标题 + 只在散文里出现的探针
    expect(system).toContain('## 本命事业推理结果（可读版）');
    expect(system).toContain('只出现在散文里的探针');

    // 3) 通用方法论段
    expect(system).toContain('## 通用事业择业方法论');

    // 两条断言互相独立：JSON 探针只能出现在 JSON 段，散文探针只能出现在散文段
    const jsonIdx = system.indexOf('## 本命事业推理结果（JSON）');
    const proseIdx = system.indexOf('## 本命事业推理结果（可读版）');
    expect(jsonIdx).toBeGreaterThanOrEqual(0);
    expect(proseIdx).toBeGreaterThan(jsonIdx);
    const jsonSection = system.slice(jsonIdx, proseIdx);
    const proseSection = system.slice(proseIdx);
    expect(jsonSection).toContain('只出现在JSON里的探针');
    expect(jsonSection).not.toContain('只出现在散文里的探针');
    expect(proseSection).toContain('只出现在散文里的探针');
    expect(proseSection).not.toContain('只出现在JSON里的探针');
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
    expect(res.body.success).toBe(false);
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
    expect(res.body.success).toBe(false);
    expect(res.body.errors[0]).toContain('会话');
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
    // 缺会话编号时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('消息为空时返回 400', async () => {
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // 钉住文案：必须是中文的「请输入问题」
    expect(res.body.errors[0]).toContain('请输入问题');
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
    // 消息为空时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('会话还在推理中时返回 409', async () => {
    // 让阶段二永远不结束，session 停在 pending
    runCareerRounds.mockImplementation(() => new Promise(() => {}));
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: created.body.sessionId, message: '你好' });
    expect(res.status).toBe(409);
    // 契约：错误响应一律 { success:false, errors:[...] }
    expect(res.body.success).toBe(false);
    // 钉住 409 的文案：pending 会话没有 session.error，必须落到兜底文案
    expect(res.body.errors[0]).toContain('事业推理尚未完成');
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
    // 会话还没好时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('阶段二失败的会话发问返回 409 且透出具体失败原因', async () => {
    // 直接往会话表塞一个 status='error' 的会话：
    // 阶段二失败是真实业务状态，必须也走 409 而不是掉进 500。
    const reason = '阶段二跑挂了';
    // 刻意给这个 error 会话塞一个半成品 career：
    // 只有「靠 status 判断」才能挡住它 —— 如果 career 也缺失，
    // 那 `!session.career` 这一条就会顺带挡住，测试就蒙混过关了。
    // 这样把 `session.status !== 'ready'` 改坏成 `=== 'pending'` 时，
    // 这条用例必然变红（status='error' 会被放行，掉进 200/500）。
    const id = putSession(app, {
      status: 'error',
      error: reason,
      career: { json: { partial: true }, prose: '半成品结果' },
    });
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: id, message: '我适合做什么行业？' });
    // 必须是 409，不能是 500
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    // 逐字等于 session.error —— 不能被兜底文案「事业推理尚未完成」盖掉
    expect(res.body.errors[0]).toBe(reason);
    // 会话失败时不该去调模型
    expect(client.callMiniMax).not.toHaveBeenCalled();
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
    expect(res.body.success).toBe(false);
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
    expect(res.body.success).toBe(false);
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
