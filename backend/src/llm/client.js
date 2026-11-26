'use strict';

const axios = require('axios');

/**
 * 调用 MiniMax，带重试。
 *
 * MiniMax 偶发返回空 choices（base_resp status_code 1000 / unknown error, 715），
 * 这类错误是服务端瞬时故障，重试即可恢复，因此对可重试错误自动重试若干次。
 */
async function callMiniMax(messages) {
  const payload = {
    model: process.env.MINIMAX_MODEL || 'MiniMax-M3',
    messages,
    max_tokens: parseInt(process.env.MINIMAX_MAX_TOKENS || '32768', 10),
    temperature: 0.7,
  };
  // 默认关闭深度思考：reasoning 会大量消耗 max_tokens 预算，导致正文被截断。
  // 只有显式写 MINIMAX_THINKING=enabled 才开启。
  if ((process.env.MINIMAX_THINKING || 'disabled').toLowerCase() !== 'enabled') {
    payload.thinking = { type: 'disabled' };
  }

  // 下限 1：配成 0 或非数字时按默认 3 次（`parseInt(...) || 3` 把 0 和 NaN 都兜成 3）；
  // `Math.max(1, ...)` 保证至少 1 次 —— 否则 for 循环一次都不执行，
  // lastError 仍是 null，后面 throw null 会让路由的 error.message 抛 TypeError
  // → unhandled rejection → 进程终止。
  const maxAttempts = Math.max(1, parseInt(process.env.MINIMAX_MAX_ATTEMPTS || '3', 10) || 3);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        'https://api.minimax.chat/v1/text/chatcompletion_v2',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: parseInt(process.env.MINIMAX_TIMEOUT_MS || '300000', 10),
        },
      );
      if (process.env.MINIMAX_DEBUG === '1') {
        console.error('MiniMax raw response:', JSON.stringify(response.data).slice(0, 2000));
      }
      if (!response.data.choices || response.data.choices.length === 0) {
        const baseResp = response.data.base_resp || {};
        // 鉴权失败（1004）与余额不足（1002）返回的是 HTTP 200，不抛异常，
        // 所以必须在这里识别；重试也救不回来，直接给准确的中文提示。
        if (baseResp.status_code === 1004) {
          throw noRetryError('大模型鉴权失败，请检查 API Key');
        }
        if (baseResp.status_code === 1002) {
          throw noRetryError('大模型账户余额不足，请检查额度');
        }
        throw new Error(`MiniMax API returned no choices. base_resp: ${JSON.stringify(baseResp)}`);
      }
      const choice = response.data.choices[0];
      const finishReason = choice.finish_reason;
      // finish_reason === 'length' 表示输出被 max_tokens 截断：
      // 这份解读是残缺的，不能当成「解读完成」交给用户。
      if (finishReason && finishReason !== 'stop') {
        throw noRetryError(finishReason === 'length'
          ? '大模型输出被截断，请稍后重试'
          : '大模型输出不完整，请稍后重试');
      }
      return choice.message.content;
    } catch (error) {
      lastError = error;
      // 明确标记为不可重试的错误（截断 / 鉴权失败 / 余额不足）：重试大概率还是同样结果
      if (error && error.noRetry) break;
      const httpStatus = error.response && error.response.status;
      // 上游用非 2xx + base_resp 报鉴权/余额问题时，给准确的中文提示且不重试
      const baseCode = error.response && error.response.data &&
        error.response.data.base_resp && error.response.data.base_resp.status_code;
      if (baseCode === 1004) {
        lastError = noRetryError('大模型鉴权失败，请检查 API Key');
        break;
      }
      if (baseCode === 1002) {
        lastError = noRetryError('大模型账户余额不足，请检查额度');
        break;
      }
      // 只重试可恢复的错误：网络/超时、服务端 5xx、上游限流 429、以及空 choices
      const retriable = !httpStatus || httpStatus >= 500 || httpStatus === 429 || /no choices/.test(error.message);
      console.error(`MiniMax 调用失败（第 ${attempt}/${maxAttempts} 次）:`, error.message);
      if (!retriable || attempt === maxAttempts) break;
      const base = parseInt(process.env.MINIMAX_RETRY_BASE_MS || '3000', 10);
      await new Promise(r => setTimeout(r, attempt * base));
    }
  }
  throw lastError || new Error('大模型调用失败，请稍后重试');
}

/** 标记一个「重试也没用」的错误 */
function noRetryError(message) {
  const err = new Error(message);
  err.noRetry = true;
  return err;
}

/** 找到字符串字面量的结束引号位置（处理转义） */
function findStringEnd(s, start) {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '"') return i;
    i++;
  }
  return -1;
}

/** 从 s[start] 处的 { 或 [ 开始，找到配对的结束位置；找不到返回 -1 */
function matchBracket(s, start) {
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      const e = findStringEnd(s, i);
      if (e === -1) return -1;
      i = e;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 括号重平衡：
 *  1) 删除"提前关闭根对象"的括号
 *  2) 删除多余的闭合括号
 *  3) 补齐结尾缺失的闭合括号
 */
function repairBraces(s) {
  const stack = [];
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      const e = findStringEnd(s, i);
      if (e === -1) { out += s.slice(i); break; }
      out += s.slice(i, e + 1);
      i = e + 1;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
      out += ch;
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = stack[stack.length - 1];
      if (stack.length === 0) { i++; continue; }
      if (expected !== ch) { i++; continue; }
      if (stack.length === 1) {
        const rest = s.slice(i + 1).replace(/^[\s,]*/, '');
        if (rest.startsWith('"')) { i++; continue; }
      }
      stack.pop();
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  while (stack.length) out += stack.pop();
  return out;
}

/** 逐段提取顶层键值对，容忍局部括号失衡 */
function extractSections(s) {
  const out = {};
  let i = s.indexOf('{');
  if (i === -1) return null;
  i++;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '}' || s[i] === ']') break;
    if (s[i] !== '"') { i++; continue; }
    const keyEnd = findStringEnd(s, i);
    if (keyEnd === -1) break;
    const key = s.slice(i + 1, keyEnd);
    i = keyEnd + 1;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== ':') { i++; continue; }
    i++;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const c = s[i];
    if (c === '{' || c === '[') {
      const end = matchBracket(s, i);
      if (end === -1) break;
      const raw = s.slice(i, end + 1);
      try {
        out[key] = JSON.parse(raw);
      } catch (e) {
        try {
          out[key] = JSON.parse(repairBraces(raw));
        } catch (e2) {
          out[key] = raw;
        }
      }
      i = end + 1;
    } else if (c === '"') {
      const end = findStringEnd(s, i);
      if (end === -1) break;
      try { out[key] = JSON.parse(s.slice(i, end + 1)); } catch (e) { /* ignore */ }
      i = end + 1;
    } else {
      const m = /^[^\s,}\]]+/.exec(s.slice(i));
      const raw = m ? m[0] : '';
      try { out[key] = JSON.parse(raw); } catch (e) { /* ignore */ }
      i += raw.length;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** 主入口：返回解析后的对象，失败返回 null */
function parseLLMJson(raw) {
  if (typeof raw !== 'string') return null;
  // 去掉 markdown 代码块包裹
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();

  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) {
    // 继续尝试容错解析
  }
  return extractSections(s);
}

/** 把内部错误翻译成给用户看的中文提示 */
function friendlyError(error) {
  const msg = error.message || String(error);
  const status = error.response && error.response.status;
  if (/no choices|status_code.?1000/i.test(msg)) {
    return '大模型服务暂时不可用，请稍后重试';
  }
  if (/ETIMEDOUT|ECONNABORTED|timeout/i.test(msg)) {
    return '大模型响应超时，请稍后重试';
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(msg)) {
    return '网络异常，请稍后重试';
  }
  if (/LLM返回格式错误/.test(msg)) {
    return '大模型返回内容无法解析，请稍后重试';
  }
  // axios 错误按状态码翻译，避免把英文原文透给用户
  if (status === 401 || status === 403) return '大模型服务鉴权失败，请检查 API Key';
  if (status === 404) return '大模型接口地址不存在，请检查配置';
  if (status === 429) return '大模型请求过于频繁，请稍后重试';
  if (status >= 500) return '大模型服务异常，请稍后重试';
  if (status >= 400) return '大模型请求被拒绝，请检查参数与配置';
  return msg;
}

module.exports = { callMiniMax, parseLLMJson, friendlyError };
