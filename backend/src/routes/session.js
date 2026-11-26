'use strict';

const express = require('express');
const { buildChart } = require('../chart/build');
const { normalizeInput } = require('./normalize-input');
const { chineseError, CHART_ERROR_FALLBACK } = require('./error-text');
const { runCareerRounds } = require('../career/run');

const router = express.Router();

/**
 * 会话表：内存保存，进程重启即失效（与 v2 的 JOBS 表同款）。
 * 一个会话包含：命盘、事业推理结果、对话历史。
 */
const SESSIONS = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000;

function newSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function getSession(id) {
  return SESSIONS.get(id) || null;
}

/** 定期清理过期会话。 */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (s.status === 'pending') continue;
    if (now - s.createdAt > SESSION_TTL_MS) SESSIONS.delete(id);
  }
}, 5 * 60 * 1000).unref();

/**
 * POST /api/session
 * 提交八字：同步完成阶段一（离线排盘）并返回，阶段二（LLM 事业推理）在后台跑。
 */
router.post('/', async (req, res) => {
  const { errors, input } = normalizeInput(req.body || {});
  if (errors) {
    return res.status(400).json({ success: false, errors });
  }

  let chart;
  try {
    chart = buildChart(input, {
      trueSolarTime: req.body.trueSolarTime === undefined ? true : !!req.body.trueSolarTime,
      dayBoundary: req.body.dayBoundary === 1 ? 1 : 2,
      qiyunMethod: req.body.qiyunMethod === 2 ? 2 : 1,
    });
  } catch (error) {
    console.error('离线排盘失败:', error && error.message);
    return res.status(400).json({
      success: false,
      errors: [chineseError(error && error.message, CHART_ERROR_FALLBACK)],
    });
  }

  const sessionId = newSessionId();
  const session = {
    id: sessionId,
    status: 'pending',
    createdAt: Date.now(),
    chart,
    career: null,
    error: null,
    history: [],
  };
  SESSIONS.set(sessionId, session);

  // 后台跑阶段二；不 await，避免请求长时间挂起被边缘代理中断。
  const maxRounds = Math.max(1, parseInt(process.env.MINIMAX_CAREER_ROUNDS || '3', 10) || 3);
  Promise.resolve()
    .then(() => runCareerRounds(chart, { maxRounds }))
    .then((result) => {
      if (!result.data) {
        session.status = 'error';
        session.error = result.parsed
          ? '大模型返回的事业推理结果不完整，请稍后重试'
          : '大模型返回内容无法解析，请稍后重试';
        return;
      }
      session.career = { json: result.data, prose: result.prose };
      session.status = 'ready';
    })
    .catch((error) => {
      console.error('事业推理失败:', error && error.message);
      session.status = 'error';
      session.error = chineseError(
        (error && error.message) || String(error),
        '事业推理失败，请稍后重试',
      );
    });

  // 一并带回离线命盘：前端可以立刻显示，不用干等大模型那几十秒。
  res.status(202).json({ success: true, sessionId, status: 'pending', chart });
});

/** GET /api/session/:id/status —— 轮询 */
router.get('/:id/status', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({
    success: true,
    sessionId: session.id,
    status: session.status,
    error: session.error || undefined,
  });
});

/** GET /api/session/:id/chart —— 阶段一结果（供勘验新 tab） */
router.get('/:id/chart', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({ success: true, chart: session.chart });
});

/** GET /api/session/:id/career —— 阶段二结果（供勘验新 tab） */
router.get('/:id/career', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  if (!session.career) {
    return res.status(404).json({
      success: false,
      errors: [session.status === 'error' ? (session.error || '事业推理失败') : '事业推理尚未完成'],
    });
  }
  res.json({ success: true, career: session.career });
});

/** GET /api/session/:id/history —— 读对话历史 */
router.get('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({ success: true, history: session.history });
});

/** POST /api/session/:id/history —— 追加一条消息 */
router.post('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  const role = req.body && req.body.role;
  const content = req.body && req.body.content;
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, errors: ['消息格式不正确'] });
  }
  session.history.push({ role, content: content.trim() });
  res.json({ success: true, count: session.history.length });
});

module.exports = router;
// 会话表共享给 chat 路由（app.locals.sessions = sessionRouter.SESSIONS）
module.exports.SESSIONS = SESSIONS;
