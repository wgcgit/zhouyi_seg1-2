'use strict';

/**
 * 排盘 options 的**唯一来源**。
 *
 * paipan（离线排盘）与 session（会话）两个路由必须用同一套流派开关，
 * 否则同一份输入在两个路由下会排出**不同的命盘** ——
 * 而接口契约要求 /api/paipan/chart 与 /api/session 的命盘一致。
 *
 * 之前这两个路由各抄了一份，靠人工同步，日后只改一边就会分叉
 * （且现有测试只比 errors，不比 chart，查不出来）。
 */

/**
 * 从请求体抽出排盘 options。
 *
 * @param {object} body 请求体
 * @returns {{trueSolarTime: boolean, dayBoundary: number, qiyunMethod: number}}
 */
function chartOptionsFrom(body) {
  const b = body || {};
  return {
    trueSolarTime: b.trueSolarTime === undefined ? true : !!b.trueSolarTime,
    dayBoundary: b.dayBoundary === 1 ? 1 : 2,
    qiyunMethod: b.qiyunMethod === 2 ? 2 : 1,
  };
}

module.exports = { chartOptionsFrom };
