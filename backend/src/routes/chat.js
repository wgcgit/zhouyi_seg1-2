'use strict';

const express = require('express');
// 注意：这里用模块对象调用，不要解构成局部变量。
// 解构（const { callMiniMax } = require(...)）会在模块加载时把函数取出来，
// 之后替换 client.callMiniMax 就无效了 —— 端到端冒烟正是靠替换来注入假 LLM。
const client = require('../llm/client');
const { buildChatSystemPrompt, buildChatUserPrompt } = require('../llm/prompt');
const { chineseError } = require('./error-text');
const { API_ERRORS, MAX_MESSAGE_LENGTH } = require('./api-errors');

const router = express.Router();

/**
 * 一次问答允许携带的 prompt 字符数上限（system + 历史 + 本轮提问）。
 *
 * 取 120000 的依据：
 *   - MiniMax-M3 的上下文是 1M token（保证 512K 可用）；
 *     实测阶段三 system prompt 约 1.3 万字符，阶段二约 7 万字符，
 *     正常对话远远达不到这个量级；
 *   - 但历史**不截断**（设计规格明写「多轮上下文全部重发」），
 *     于是长对话可能无界增长 ⇒ 超出模型上下文 ⇒ 模型报错 ⇒ 用户只看到 500。
 *   - 所以这里设一道**保守的闸**：超了就在本地挡掉，给一句用户看得懂的中文提示，
 *     而不是白烧一次模型调用再报「问答失败」。
 *
 * 这个常量只写在 chat.js 一处，不散落到别的文件。
 */
const MAX_PROMPT_CHARS = 120000;

/**
 * 把异常翻成中文提示。
 *
 * 两层兜底：
 *   1. client.friendlyError —— 能把 axios 的英文原文（timeout / no choices 等）翻成中文；
 *   2. chineseError —— friendlyError 覆盖不到的英文仍会原样返回，这里再兜一次，
 *      保证不透给用户任何英文原文。
 *
 * @param {*} error 捕获到的异常
 * @returns {string} 中文错误信息
 */
function toChineseError(error) {
  let friendly = '';
  try {
    if (error && error.message && typeof client.friendlyError === 'function') {
      friendly = client.friendlyError(error);
    }
  } catch (e) {
    friendly = '';
  }
  const raw = friendly || (error && error.message) || '';
  return chineseError(raw, API_ERRORS.CHAT_FAILED);
}

/**
 * POST /api/chat
 * 阶段三：基于本命事业推理结果 + 通用方法论回答事业问题。
 */
router.post('/', async (req, res) => {
  const body = req.body || {};
  const sessionId = body.sessionId;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!sessionId) {
    return res.status(400).json({ success: false, errors: [API_ERRORS.MISSING_SESSION_ID] });
  }
  if (!message) {
    return res.status(400).json({ success: false, errors: [API_ERRORS.EMPTY_MESSAGE] });
  }
  // 单条提问的长度上限：防住「一个 10MB 的 message 直接进 prompt」。
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, errors: [API_ERRORS.MESSAGE_TOO_LONG] });
  }

  // 从会话表取。session 路由不导出 SESSIONS，这里通过 createApp 注入的共享表读取。
  const session = req.app.locals.sessions && req.app.locals.sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });
  }
  // 访问即续期：TTL 按闲置时间算（与 session 路由的 getSession 同一套语义）。
  session.lastActiveAt = Date.now();
  if (session.status !== 'ready' || !session.career) {
    return res.status(409).json({
      success: false,
      errors: [session.error || API_ERRORS.CHAT_CAREER_PENDING],
    });
  }

  let answer;
  try {
    // 顺序要紧：先用「旧历史 + 本次提问」组装 prompt，
    // 拿到答案之后才把本轮问答写回历史 ——
    // 反了同一条提问会在 prompt 里出现两遍。
    const systemPrompt = buildChatSystemPrompt(session.career.json, session.career.prose);
    const userPrompt = buildChatUserPrompt(session.history, message);

    // 预算预检：超预算就在本地挡掉，**不调模型**（省一次大模型调用），
    // 并给用户一句「刷新页面开新会话」的明确提示。
    if (systemPrompt.length + userPrompt.length > MAX_PROMPT_CHARS) {
      return res.status(400).json({ success: false, errors: [API_ERRORS.CHAT_CONTEXT_TOO_LONG] });
    }

    const raw = await client.callMiniMax([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    answer = typeof raw === 'string' ? raw.trim() : '';
  } catch (error) {
    console.error(API_ERRORS.LOG_CHAT_FAILED, error && error.message);
    return res.status(500).json({
      success: false,
      errors: [toChineseError(error)],
    });
  }

  if (!answer) {
    return res.status(500).json({ success: false, errors: [API_ERRORS.LLM_EMPTY_ANSWER] });
  }

  // 记进历史：用户问 + 助手答
  session.history.push({ role: 'user', content: message });
  session.history.push({ role: 'assistant', content: answer });

  res.json({ success: true, answer });
});

module.exports = router;
