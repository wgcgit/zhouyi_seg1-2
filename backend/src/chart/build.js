'use strict';

const { computeChart } = require('../core/pillars');
const { computeInteractions } = require('../core/interactions');
const { computeShenSha } = require('../core/shensha');
const { computeStrength } = require('../analyze/strength');
const { computePattern } = require('../analyze/pattern');
const { computeFortune } = require('../fortune/dayun');

/**
 * 命盘 JSON 契约（离线层 → LLM 层 的唯一接口）。
 *
 * 设计原则（方案文档 §7 硬经验三）：解释层留空或标注。
 * 本层只输出「确定算得出」的事实与「候选」，不输出有流派分歧的定论：
 *   - dayMasterStrength（身强身弱定论）→ null
 *   - usefulGod（用神）→ null
 *   - finalPattern（最终格局）→ null
 * 这三项由 LLM 在解读时基于候选给出判断，但不允许 LLM 重算四柱。
 *
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.gender   'male' | 'female'
 * @param {number} input.year
 * @param {number} input.month
 * @param {number} input.day
 * @param {number} input.hour
 * @param {number} [input.minute]
 * @param {number} [input.second]
 * @param {string} input.province
 * @param {string} input.city
 * @param {object} [options]  流派开关
 * @returns {object} 完整命盘 JSON
 */
function buildChart(input, options = {}) {
  const chart = computeChart(input, options);
  const dayGan = chart.dayMaster.gan;

  const interactions = computeInteractions(chart.derived);
  const shensha = computeShenSha(chart.derived, dayGan);
  const strength = computeStrength(chart.derived, dayGan);
  const pattern = computePattern(chart.derived, dayGan);
  const fortune = computeFortune(chart, options);

  return {
    meta: {
      schemaVersion: '1.0',
      engine: 'zhouyi-v2-offline',
      generatedAt: new Date().toISOString(),
      lunarLibrary: 'lunar-javascript@1.7.8',
    },
    input: {
      name: chart.input.name || '',
      gender: chart.input.gender === 'male' ? '男' : '女',
      birthClockTime: chart.time.clock,
      trueSolarTime: chart.time.trueSolar,
      province: chart.input.province,
      city: chart.input.city,
      longitude: chart.input.longitude,
      latitude: chart.input.latitude,
      timeAdjustments: {
        dstOffsetHours: chart.time.dstOffsetHours,
        longitudeCorrectionMinutes: chart.time.longitudeCorrectionMinutes,
        equationOfTimeMinutes: chart.time.equationOfTimeMinutes,
      },
    },
    settings: {
      trueSolarTime: chart.options.trueSolarTime,
      dayBoundary: chart.options.dayBoundary === 1 ? '23:00 换日' : '00:00 换日',
      qiyunMethod: chart.options.qiyunMethod === 1 ? '三天折一岁' : '精确分钟折算',
    },
    pillars: chart.pillars,
    dayMaster: chart.dayMaster,
    derived: chart.derived,
    interactions,
    shensha,
    strength,
    pattern,
    fortune: {
      direction: fortune.direction,
      directionReason: fortune.directionReason,
      startAge: fortune.startAge,
      startDate: fortune.startDate,
      method: fortune.method,
      dayun: fortune.dayun,
      liunian: fortune.liunian,
    },
    lunar: chart.lunar,
  };
}

/** 契约字段清单，供测试断言与文档生成使用 */
const CONTRACT_FIELDS = [
  'meta', 'input', 'settings', 'pillars', 'dayMaster',
  'derived', 'interactions', 'shensha', 'strength', 'pattern', 'fortune', 'lunar',
];

module.exports = { buildChart, CONTRACT_FIELDS };
