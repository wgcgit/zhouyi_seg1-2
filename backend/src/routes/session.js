'use strict';

const crypto = require('crypto');
const express = require('express');
const { buildChart } = require('../chart/build');
const { normalizeInput } = require('./normalize-input');
const { chineseError, CHART_ERROR_FALLBACK } = require('./error-text');
const { API_ERRORS, MAX_MESSAGE_LENGTH } = require('./api-errors');
const { chartOptionsFrom } = require('./chart-options');
const { runCareerRounds } = require('../career/run');

const router = express.Router();

/**
 * 会话表：内存保存，进程重启即失效（与 v2 的 JOBS 表同款）。
 * 一个会话包含：命盘、事业推理结果、对话历史。
 */
const SESSIONS = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000;

function newSessionId() {
  return 'sess_' + crypto.randomUUID();
}

/**
 * 取会话，并把「最后活跃时间」刷新到现在。
 *
 * TTL 按**闲置**时间算（每次访问都续期），而不是「创建后满 1 小时」——
 * 否则用户连续聊一小时，会话在聊天中途就过期了。
 *
 * @param {string} id 会话编号
 * @returns {object|null} 会话；不存在时返回 null
 */
function getSession(id) {
  const session = SESSIONS.get(id);
  if (!session) return null;
  session.lastActiveAt = Date.now();
  return session;
}

/**
 * 清理闲置超过 TTL 的会话（含 pending 的）。
 *
 * pending 会话也要纳入过期：阶段二挂了以后会话永远停在 pending，
 * 不清理的话它会一直占着内存。
 *
 * @param {number} now 当前时间戳
 */
function sweepExpiredSessions(now) {
  for (const [id, s] of SESSIONS) {
    const lastActiveAt = typeof s.lastActiveAt === 'number' ? s.lastActiveAt : s.createdAt;
    if (now - lastActiveAt > SESSION_TTL_MS) SESSIONS.delete(id);
  }
}

setInterval(() => sweepExpiredSessions(Date.now()), 5 * 60 * 1000).unref();

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
    chart = buildChart(input, chartOptionsFrom(req.body));
  } catch (error) {
    console.error(API_ERRORS.LOG_CHART_FAILED, chineseError(error && error.message, CHART_ERROR_FALLBACK));
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
    lastActiveAt: Date.now(),
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
        session.error = result.parsed ? API_ERRORS.CAREER_INCOMPLETE : API_ERRORS.CAREER_UNPARSABLE;
        return;
      }
      session.career = { json: result.data, prose: result.prose };
      session.status = 'ready';
    })
    .catch((error) => {
      console.error(API_ERRORS.LOG_CAREER_FAILED, chineseError(error && error.message, API_ERRORS.CAREER_FAILED));
      session.status = 'error';
      session.error = chineseError(
        (error && error.message) || String(error),
        API_ERRORS.CAREER_FAILED,
      );
    });

  // 一并带回离线命盘：前端可以立刻显示，不用干等大模型那几十秒。
  res.status(202).json({ success: true, sessionId, status: 'pending', chart });
});

/** GET /api/session/:id/status —— 轮询 */
router.get('/:id/status', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
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
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
  }
  res.json({ success: true, chart: session.chart });
});

/** GET /api/session/:id/career —— 阶段二结果（供勘验新 tab） */
router.get('/:id/career', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
  }
  if (!session.career) {
    return res.status(404).json({
      success: false,
      errors: [
        session.status === 'error'
          ? (session.error || API_ERRORS.CAREER_FAILED)
          : API_ERRORS.SESSION_CAREER_PENDING,
      ],
    });
  }
  res.json({ success: true, career: session.career });
});

/** GET /api/session/:id/history —— 读对话历史 */
router.get('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
  }
  res.json({ success: true, history: session.history });
});

/** POST /api/session/:id/history —— 追加一条消息 */
router.post('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
  }
  const role = req.body && req.body.role;
  const content = req.body && req.body.content;
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, errors: [API_ERRORS.HISTORY_FORMAT_INVALID] });
  }
  // 单条消息长度上限：历史条数不限（规格要求全量重发），
  // 但**单条**消息必须有闸，否则一条 10MB 的消息就能把 prompt 撑爆。
  if (content.trim().length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, errors: [API_ERRORS.MESSAGE_TOO_LONG] });
  }
  session.history.push({ role, content: content.trim() });
  res.json({ success: true, count: session.history.length });
});

module.exports = router;
// 会话表共享给 chat 路由（app.locals.sessions = sessionRouter.SESSIONS）
module.exports.SESSIONS = SESSIONS;
// 过期清理抽成函数，便于测试直接驱动（不靠等 5 分钟的定时器）
module.exports.sweepExpiredSessions = sweepExpiredSessions;
module.exports.SESSION_TTL_MS = SESSION_TTL_MS;
