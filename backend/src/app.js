'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const paipanRouter = require('./routes/paipan');
const sessionRouter = require('./routes/session');

/**
 * 组装 Express 应用（不调用 listen，便于测试用 supertest 直接驱动）。
 */
function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  // 健康检查。平台的探活可能打 /health，前端与测试习惯用 /api/health，
  // 两个路径返回同一份内容 —— 少一个就可能在部署时探活失败。
  const healthHandler = (req, res) => {
    res.json({ success: true, service: 'zhouyi-seg1-2', version: '0.1.0' });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  app.use('/api/paipan', paipanRouter);
  app.use('/api/session', sessionRouter);

  // 前端静态资源（存在时才挂载）
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // 未知路由：中文 404，不用 Express 默认的英文 HTML
  app.use((req, res) => {
    res.status(404).json({ success: false, errors: ['请求的接口不存在'] });
  });

  // 统一错误处理：错误提示一律中文，第三方库的英文原文不透给用户
  app.use((err, req, res, next) => {
    // express.json() 解析失败：err.type === 'entity.parse.failed'，状态码应为 400
    const status = Number(err.status || err.statusCode) || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ success: false, errors: ['请求参数不合法'] });
    }
    console.error('服务端未处理的异常:', err && err.message);
    res.status(500).json({ success: false, errors: ['服务器内部错误，请稍后重试'] });
  });

  return app;
}

module.exports = { createApp };
