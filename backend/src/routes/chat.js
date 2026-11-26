'use strict';

const express = require('express');
// 注意：这里用模块对象调用，不要解构成局部变量。
// 解构（const { callMiniMax } = require(...)）会在模块加载时把函数取出来，
// 之后替换 client.callMiniMax 就无效了 —— 端到端冒烟正是靠替换来注入假 LLM。
const client = require('../llm/client');
const { buildChatSystemPrompt, buildChatUserPrompt } = require('../llm/prompt');
const { chineseError } = require('./error-text');

const router = express.Router();

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
  return chineseError(raw, '问答失败，请稍后重试');
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
    return res.status(400).json({ success: false, errors: ['缺少会话编号'] });
  }
  if (!message) {
    return res.status(400).json({ success: false, errors: ['请输入问题'] });
  }

  // 从会话表取。session 路由不导出 SESSIONS，这里通过 createApp 注入的共享表读取。
  const session = req.app.locals.sessions && req.app.locals.sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  if (session.status !== 'ready' || !session.career) {
    return res.status(409).json({
      success: false,
      errors: [session.error || '事业推理尚未完成，请稍后再问'],
    });
  }

  let answer;
  try {
    // 顺序要紧：先用「旧历史 + 本次提问」组装 prompt，
    // 拿到答案之后才把本轮问答写回历史 ——
    // 反了同一条提问会在 prompt 里出现两遍。
    const raw = await client.callMiniMax([
      { role: 'system', content: buildChatSystemPrompt(session.career.json, session.career.prose) },
      { role: 'user', content: buildChatUserPrompt(session.history, message) },
    ]);
    answer = typeof raw === 'string' ? raw.trim() : '';
  } catch (error) {
    console.error('chat 调用失败:', error && error.message);
    return res.status(500).json({
      success: false,
      errors: [toChineseError(error)],
    });
  }

  if (!answer) {
    return res.status(500).json({ success: false, errors: ['大模型没有返回内容，请稍后重试'] });
  }

  // 记进历史：用户问 + 助手答
  session.history.push({ role: 'user', content: message });
  session.history.push({ role: 'assistant', content: answer });

  res.json({ success: true, answer });
});

module.exports = router;
