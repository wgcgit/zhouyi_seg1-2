'use strict';

const { Solar, EightChar } = require('lunar-javascript');
const { trueSolarTime, formatDateTime } = require('../calendar/true-solar-time');
const { lookupCoords } = require('../geo');
const D = require('./derived');
const C = require('./constants');

/** 流派开关默认值 */
const DEFAULT_OPTIONS = {
  // 真太阳时校正（用户已确认默认开启）
  trueSolarTime: true,
  // 换日流派：1 = 23:00 换日（子初换日，多数流派），2 = 00:00 换日
  // 用户要求默认关闭换日方式，所以默认走 00:00 换日
  dayBoundary: 2,
  // 起运折算：1 = 三天折一岁（按整日/时辰），2 = 按分钟精确折算
  qiyunMethod: 1,
};

/**
 * 排四柱主入口。
 *
 * @param {object} input
 * @param {string} input.name        姓名（可空）
 * @param {string} input.gender      'male' | 'female'
 * @param {number} input.year        公历年
 * @param {number} input.month       公历月
 * @param {number} input.day         公历日
 * @param {number} input.hour        挂钟小时 0–23
 * @param {number} [input.minute]    挂钟分钟
 * @param {number} [input.second]    挂钟秒
 * @param {string} input.province    省级名称
 * @param {string} input.city        城市名称
 * @param {object} [options]         流派开关
 * @returns {object} 排盘结果
 */
function computeChart(input, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };

  const coords = lookupCoords(input.province, input.city);
  if (!coords) {
    throw new Error(`查不到城市经纬度：${input.province}/${input.city}`);
  }

  // ---- ① 真太阳时校正 ----
  const tst = opt.trueSolarTime
    ? trueSolarTime({
        year: input.year, month: input.month, day: input.day,
        hour: input.hour, minute: input.minute || 0, second: input.second || 0,
        longitude: coords.lng,
      })
    : null;

  const ts = tst ? tst.trueSolar : {
    year: input.year, month: input.month, day: input.day,
    hour: input.hour, minute: input.minute || 0, second: input.second || 0,
  };

  // ---- ② 四柱（历法交给库）----
  const solar = Solar.fromYmdHms(ts.year, ts.month, ts.day, ts.hour, ts.minute, ts.second);
  const lunar = solar.getLunar();
  const ec = EightChar.fromLunar(lunar);
  ec.setSect(opt.dayBoundary); // 1 = 23:00 换日；2 = 00:00 换日

  const pillars = {
    year: ec.getYear(),
    month: ec.getMonth(),
    day: ec.getDay(),
    hour: ec.getTime(),
  };
  const dayGan = pillars.day[0];

  // ---- ③ 派生静态信息 ----
  const derived = {
    year: D.derivePillar(pillars.year, dayGan, false),
    month: D.derivePillar(pillars.month, dayGan, false),
    day: D.derivePillar(pillars.day, dayGan, true),
    hour: D.derivePillar(pillars.hour, dayGan, false),
  };

  return {
    input: { ...input, longitude: coords.lng, latitude: coords.lat },
    options: opt,
    time: {
      clock: formatDateTime({
        year: input.year, month: input.month, day: input.day,
        hour: input.hour, minute: input.minute || 0, second: input.second || 0,
      }),
      trueSolar: formatDateTime(ts),
      dstOffsetHours: tst ? tst.dstOffsetHours : 0,
      longitudeCorrectionMinutes: tst ? round4(tst.longitudeCorrectionMinutes) : 0,
      equationOfTimeMinutes: tst ? round4(tst.equationOfTimeMinutes) : 0,
    },
    lunar: {
      year: lunar.getYearInChinese(),
      month: lunar.getMonthInChinese(),
      day: lunar.getDayInChinese(),
    },
    dayMaster: {
      gan: dayGan,
      element: C.GAN_ELEMENT[dayGan],
      yinYang: D.ganYinYang(dayGan),
    },
    pillars,
    derived,
    _lunar: lunar,
    _ec: ec,
  };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { computeChart, DEFAULT_OPTIONS };
