'use strict';

/**
 * 共用的中文错误兜底。
 *
 * 第三方库的英文原文不直接透给用户，但已经是中文的具体原因
 * （例如「查不到城市经纬度：不存在省/不存在市」）要原样保留。
 */

/** 判断一段文本里有没有中文 */
function hasChinese(text) {
  return /[一-龥]/.test(String(text === null || text === undefined ? '' : text));
}

/**
 * 把错误文案兜底成中文。
 *
 * @param {any} text 原始错误文案
 * @param {string} fallback 没有中文时使用的兜底文案
 * @returns {string}
 */
function chineseError(text, fallback) {
  const s = String(text === null || text === undefined ? '' : text);
  return hasChinese(s) ? s : fallback;
}

/** 离线排盘失败的兜底文案 */
const CHART_ERROR_FALLBACK = '排盘失败，请检查出生信息是否正确';

/** 大模型调用失败的兜底文案 */
const LLM_ERROR_FALLBACK = '大模型调用失败，请稍后重试';

module.exports = { chineseError, hasChinese, CHART_ERROR_FALLBACK, LLM_ERROR_FALLBACK };
