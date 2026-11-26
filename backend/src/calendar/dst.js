'use strict';

/**
 * 中国夏令时（DST）表。
 * 中国 1986–1991 年实行夏令时，起止时刻均为当地时间 02:00（拨快到 03:00 / 拨慢回 02:00）。
 * 数据来源：百度百科「中国夏令时」、维基百科「中国夏令时」、Time and Date（三方一致）。
 *
 * 每项：[起始日期, 结束日期]，含首尾两天。
 */
const DST_RANGES = [
  ['1986-05-04', '1986-09-14'],
  ['1987-04-12', '1987-09-13'],
  ['1988-04-10', '1988-09-11'],
  ['1989-04-16', '1989-09-17'],
  ['1990-04-15', '1990-09-16'],
  ['1991-04-14', '1991-09-15'],
];

/**
 * 判断给定的「挂钟时间」是否处于中国夏令时期间。
 *
 * 注意：夏令时当天 00:00–02:00 属标准时，02:00 起拨快一小时；结束日 02:00 拨慢回标准时。
 * 本函数按「日期 + 是否已过 02:00」判定：
 *   - 起始日 02:00 之前 → 标准时（拨快前）
 *   - 结束日 02:00 起 → 标准时（拨慢后）
 *
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} hour    挂钟小时 0–23
 * @returns {boolean}
 */
function isChinaDST(dateStr, hour) {
  for (const [start, end] of DST_RANGES) {
    if (dateStr < start || dateStr > end) continue;
    if (dateStr === start) return hour >= 2;
    if (dateStr === end) return hour < 2;
    return true;
  }
  return false;
}

/**
 * 返回该挂钟时间对应的 UTC 偏移小时数（东八区 + 夏令时一小时）。
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} hour    挂钟小时 0–23
 * @returns {number} 8 或 9
 */
function utcOffsetHours(dateStr, hour) {
  return isChinaDST(dateStr, hour) ? 9 : 8;
}

module.exports = { DST_RANGES, isChinaDST, utcOffsetHours };
