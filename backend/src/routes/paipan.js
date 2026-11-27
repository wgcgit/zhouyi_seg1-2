'use strict';

const express = require('express');
const { buildChart, CONTRACT_FIELDS } = require('../chart/build');
const { listAllKeys, CITY_COUNT } = require('../geo');
const { normalizeInput } = require('./normalize-input');
const { chineseError, CHART_ERROR_FALLBACK } = require('./error-text');
const { chartOptionsFrom } = require('./chart-options');

const router = express.Router();

/**
 * POST /api/paipan/chart
 * 离线排盘：同步返回完整命盘 JSON（不含 LLM 解读）。
 */
router.post('/chart', (req, res) => {
  const { errors, input } = normalizeInput(req.body || {});
  if (errors) {
    return res.status(400).json({ success: false, errors });
  }
  try {
    // options 来自共享模块（与 session 路由同一份），保证两个路由排出同一个命盘。
    const chart = buildChart(input, chartOptionsFrom(req.body));
    res.json({ success: true, data: chart });
  } catch (err) {
    // 第三方库的英文原文不直接透给用户；已经是中文的具体原因原样保留
    res.status(400).json({ success: false, errors: [chineseError(err.message, CHART_ERROR_FALLBACK)] });
  }
});

/** GET /api/paipan/cities —— 全部可选城市（省/市），供前端下拉 */
router.get('/cities', (req, res) => {
  res.json({ success: true, count: CITY_COUNT, cities: listAllKeys() });
});

/** GET /api/paipan/schema —— 命盘 JSON 契约的顶层字段清单 */
router.get('/schema', (req, res) => {
  res.json({ success: true, fields: CONTRACT_FIELDS });
});

module.exports = router;
