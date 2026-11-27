'use strict';

/**
 * API 错误文案的**唯一来源**。
 *
 * 之前 session 路由与 chat 路由各自写着中文字面量文案，已经漂移过：
 * 勘验页的「事业推理尚未完成」与聊天页的「事业推理尚未完成，请稍后再问」
 * 语义不同（前者是「还在算」，后者是「还没好」），**不该合并成一句**，
 * 但**必须从同一处定义**，否则下次又会长出第三份。
 *
 * ⚠️ 文案逐字不能改：前端 result.js 按 404 的文案分流，测试也逐字断言。
 */

/** 单条消息（提问 / 追加历史）的字符数上限 */
const MAX_MESSAGE_LENGTH = 2000;

const API_ERRORS = {
  /** 会话不存在或已过期（session 与 chat 共用同一句） */
  SESSION_NOT_FOUND: '会话不存在或已过期',
  /** 阶段二还在算（勘验页取事业结果） */
  SESSION_CAREER_PENDING: '事业推理尚未完成',
  /** 阶段二还没好（聊天页发问） */
  CHAT_CAREER_PENDING: '事业推理尚未完成，请稍后再问',
  /** 追加历史的消息格式不对 */
  HISTORY_FORMAT_INVALID: '消息格式不正确',
  /** 缺少会话编号 */
  MISSING_SESSION_ID: '缺少会话编号',
  /** 没输入问题 */
  EMPTY_MESSAGE: '请输入问题',
  /** 消息太长 */
  MESSAGE_TOO_LONG: '消息长度不能超过 ' + MAX_MESSAGE_LENGTH + ' 个字符',
  /** 对话太长，本轮提问没发出去 */
  CHAT_CONTEXT_TOO_LONG: '对话已经太长了，本次提问没有发送。请刷新页面开始新的会话。',
  /** 阶段三调用失败 */
  CHAT_FAILED: '问答失败，请稍后重试',
  /** 阶段三模型返回空内容 */
  LLM_EMPTY_ANSWER: '大模型没有返回内容，请稍后重试',
  /** 阶段二返回的结果不完整 */
  CAREER_INCOMPLETE: '大模型返回的事业推理结果不完整，请稍后重试',
  /** 阶段二返回的内容无法解析 */
  CAREER_UNPARSABLE: '大模型返回内容无法解析，请稍后重试',
  /** 阶段二失败 */
  CAREER_FAILED: '事业推理失败，请稍后重试',
  /** 日志前缀：离线排盘失败 */
  LOG_CHART_FAILED: '离线排盘失败:',
  /** 日志前缀：事业推理失败 */
  LOG_CAREER_FAILED: '事业推理失败:',
  /** 日志前缀：聊天调用失败 */
  LOG_CHAT_FAILED: 'chat 调用失败:',
};

module.exports = { API_ERRORS, MAX_MESSAGE_LENGTH };
