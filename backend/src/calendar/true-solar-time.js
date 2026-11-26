'use strict';

const { utcOffsetHours } = require('./dst');

/** 北京时间的中央子午线经度（东经 120°） */
const TZ_MERIDIAN = 120;

/**
 * 均时差（Equation of Time），单位分钟。
 * 采用 Spencer 近似式，误差约 ±0.5 分钟；相对 NOAA 公式误差 ≤ 0.8 分钟。
 *
 *   B  = 2π/365 × (一年中的第几天 − 81)
 *   E  = 9.87 sin(2B) − 7.53 cos(B) − 1.5 sin(B)
 *
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day   1–31
 * @returns {number} 分钟（正表示真太阳时快于平太阳时）
 */
function equationOfTime(year, month, day) {
  const dayOfYear = dayOfYearOf(year, month, day);
  const B = (2 * Math.PI / 365) * (dayOfYear - 81);
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/** 该日期是一年中的第几天（1–366），按公历平年闰年规则 */
function dayOfYearOf(year, month, day) {
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return cumulative[month - 1] + day + (month > 2 && isLeap ? 1 : 0);
}

/**
 * 真太阳时校正。
 *
 * 两步：
 *   ① 经度校正：偏离东经 120° 每 1° 差 4 分钟（东经为正）
 *   ② 均时差补偿
 *
 * 换算链路：出生地挂钟时间 → 北京时间(UTC+8) → 真太阳时。
 * 夏令时期间挂钟快一小时，先拨回标准时再做经度与均时差校正。
 *
 * @param {object} p
 * @param {number} p.year
 * @param {number} p.month
 * @param {number} p.day
 * @param {number} p.hour
 * @param {number} [p.minute]
 * @param {number} [p.second]
 * @param {number} p.longitude 东经度数
 * @returns {object}
 */
function trueSolarTime(p) {
  const { year, month, day, hour, longitude } = p;
  const minute = p.minute || 0;
  const second = p.second || 0;

  const dateStr = formatDate(year, month, day);
  const dstOffset = utcOffsetHours(dateStr, hour) - 8; // 0 或 1 小时

  const clockTotalMinutes = hour * 60 + minute + second / 60;
  // 挂钟 → 北京时间：夏令时期间拨慢一小时
  const beijingTotalMinutes = clockTotalMinutes - dstOffset * 60;

  const longitudeCorrectionMinutes = (longitude - TZ_MERIDIAN) * 4;
  const eotMinutes = equationOfTime(year, month, day);
  const offsetMinutes = longitudeCorrectionMinutes + eotMinutes;

  // 以「当日 00:00 的 UTC 时刻」为基准，加上偏移分钟数，日期进位由 Date 自动处理
  const base = Date.UTC(year, month - 1, day, 0, 0, 0);
  const shifted = new Date(base + (beijingTotalMinutes + offsetMinutes) * 60 * 1000);

  return {
    clockTotalMinutes,
    beijingTotalMinutes,
    trueSolarTotalMinutes: beijingTotalMinutes + offsetMinutes,
    longitudeCorrectionMinutes,
    equationOfTimeMinutes: eotMinutes,
    dstOffsetHours: dstOffset,
    trueSolar: {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    },
  };
}

/** 把日期格式化成 'YYYY-MM-DD' */
function formatDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 把 {year,month,day,hour,minute,second} 格式化成 'YYYY-MM-DD HH:mm:ss' */
function formatDateTime(parts) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(parts.year, 4)}-${p(parts.month)}-${p(parts.day)} ` +
    `${p(parts.hour)}:${p(parts.minute || 0)}:${p(parts.second || 0)}`;
}

module.exports = {
  TZ_MERIDIAN,
  equationOfTime,
  dayOfYearOf,
  trueSolarTime,
  formatDate,
  formatDateTime,
};
