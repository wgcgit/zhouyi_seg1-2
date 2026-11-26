'use strict';

const client = require('../llm/client');
const { buildCareerSystemPrompt, buildCareerUserPrompt } = require('../llm/prompt');
const { PILLAR_KEYS } = require('../core/interactions');
const { validateCareer } = require('./validate');
const { renderCareerProse } = require('./render');

/** 日志里最多展开几条缺陷（缺陷数组可能很长，前几条通常是根因） */
const MAX_LOG_DEFECTS = 5;

/** 判断一段文字里有没有中文 */
function hasChinese(text) {
  return /[一-龥]/.test(String(text || ''));
}

/**
 * 把异常翻译成**中文**错误信息。
 *
 * 优先用 client.friendlyError（它已经会把 axios 的英文原文翻译成中文）；
 * 但它对没覆盖到的异常会原样返回英文，所以这里再兜一层：
 * 翻译结果里没有中文就换成一句通用中文提示，绝不把英文原文透出去。
 *
 * @param {*} error 捕获到的异常
 * @returns {string} 中文错误信息
 */
function chineseError(error) {
  let friendly = '';
  try {
    friendly = typeof client.friendlyError === 'function' ? client.friendlyError(error) : '';
  } catch (e) {
    friendly = '';
  }
  if (hasChinese(friendly)) return String(friendly);

  const raw = String((error && error.message) || error || '');
  if (hasChinese(raw)) return raw;
  return '大模型调用失败，请稍后重试';
}

/**
 * 跑一轮「调用 → 解析 → 四柱比对 → 契约校验」。
 *
 * 顺序是刻意的，**不能改**：
 *   1. 调用模型；
 *   2. 解析 JSON；
 *   3. 四柱比对 —— 解读层不得重排四柱，离线命盘是程序与模型之间的唯一接口，
 *      模型若把四柱改写了，整份推理就是基于错误命盘生成的，必须**当场判废**；
 *      这项检查只能在 run.js 里做（validateCareer 只拿到 data，不知道离线命盘）；
 *   4. 契约校验（validateCareer 只管形状：13 键、枚举、必填、minItems 等）。
 *
 * @param {object} chart 离线命盘
 * @param {object} [options] `{ callLLM?: Function, maxRounds?: number }`
 * @returns {Promise<{data: object|null, parsed: boolean, defects: string[]}>}
 *   data 为 null 表示这一轮不合规；parsed 表示「响应本身是合法 JSON 对象」。
 */
async function runCareerOnce(chart, options) {
  const opts = options || {};
  const callLLM = opts.callLLM || client.callMiniMax;

  let raw;
  try {
    raw = await callLLM([
      { role: 'system', content: buildCareerSystemPrompt() },
      { role: 'user', content: buildCareerUserPrompt(chart) },
    ]);
  } catch (error) {
    // 调用失败（含网络/超时/空 choices）由 client 内部重试；到这里说明重试后仍失败。
    return { data: null, parsed: false, defects: [chineseError(error)] };
  }

  const data = client.parseLLMJson(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { data: null, parsed: false, defects: ['响应不是 JSON 对象'] };
  }

  // 解读层不得重排四柱：命盘 JSON 是离线层与模型之间的唯一接口。
  // 模型若把四柱改写了，整份推理就是基于错误命盘生成的，必须当场判废。
  const modelPillars = data.case && data.case.pillars;
  const chartPillars = chart && chart.pillars;
  // 离线命盘缺四柱属于上游出了 bug（buildChart 的契约里 pillars 一定存在），
  // 此时四柱比对整条防线失效，必须响亮地判废，而不是静默放行模型的任意四柱。
  if (!chartPillars || typeof chartPillars !== 'object') {
    return { data: null, parsed: true, defects: ['缺少离线命盘的四柱，无法核对模型输出'] };
  }
  if (modelPillars && typeof modelPillars === 'object') {
    for (const k of PILLAR_KEYS) {
      if (typeof modelPillars[k] === 'string' && modelPillars[k] !== chartPillars[k]) {
        return {
          data: null,
          parsed: true,
          defects: [`四柱不一致：${k} 被改写为 ${modelPillars[k]}，离线命盘是 ${chartPillars[k]}`],
        };
      }
    }
  }

  const result = validateCareer(data);
  if (result.ok) return { data, parsed: true, defects: [] };
  return { data: null, parsed: true, defects: result.defects };
}

/**
 * 「调用 → 解析 → 校验」整轮重试。
 *
 * 模型输出是随机的：偶尔会漏字段、枚举写错。实测同一份命盘本地连跑两次都成功，
 * 所以单次不合规就判废会让这个功能「偶发失败」。重试通常就正常了。
 * 网络类错误（超时/5xx/空 choices）仍由 callMiniMax 内部重试，两层不冲突。
 *
 * @param {object} chart 离线命盘
 * @param {object} [options] `{ callLLM?: Function, maxRounds?: number }`
 * @returns {Promise<{data: object|null, prose: string, parsed: boolean, defects: string[]}>}
 */
async function runCareerRounds(chart, options) {
  const opts = options || {};
  const maxRounds = Math.max(1, opts.maxRounds || 3);
  let parsed = false;
  let defects = [];

  for (let round = 1; round <= maxRounds; round++) {
    const r = await runCareerOnce(chart, opts);
    if (r.data) {
      return { data: r.data, prose: renderCareerProse(r.data), parsed: true, defects: [] };
    }
    parsed = r.parsed;
    defects = r.defects;
    // 日志只打缺陷字段路径与轮次，**不打模型原始输出**（可能很长，也可能含用户隐私）。
    const shown = defects.slice(0, MAX_LOG_DEFECTS);
    const more = defects.length > shown.length ? `（共 ${defects.length} 条，只列前 ${shown.length} 条）` : '';
    console.error(
      `事业推理结果不符合契约（第 ${round}/${maxRounds} 轮），缺失或非法字段:`,
      shown.join('、') || '（整段不是合法 JSON）',
      more,
    );
  }
  return { data: null, prose: '', parsed, defects };
}

module.exports = { runCareerOnce, runCareerRounds };
