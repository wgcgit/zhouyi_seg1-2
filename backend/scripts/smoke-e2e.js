'use strict';

/**
 * 端到端冒烟：注入假 LLM，跑通「提交 → 轮询 → 取两个结果 → 问一句话」全链路。
 * 不调真实模型，不花 token。
 */

const path = require('path');
const fs = require('fs');

// 先替换 client 里的 callMiniMax，再加载 app。
const clientPath = require.resolve('../src/llm/client');
const client = require(clientPath);

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

const request = require('supertest');
const { buildChart } = require('../src/chart/build');
const { normalizeInput } = require('../src/routes/normalize-input');

// 用与 session 路由完全相同的参数排一次盘，拿到期望的四柱。
//
// **必须算在下面替换 client.callMiniMax 之前**：假 LLM 的函数体里会引用
// expectedPillars，若它用 const 声明在后面，调用时会抛
// ReferenceError: Cannot access 'expectedPillars' before initialization。
const normalized = normalizeInput(VALID_BODY);
if (normalized.errors) {
  console.error('冒烟输入本身就不合法：' + normalized.errors.join('；'));
  process.exit(1);
}
const expectedChart = buildChart(normalized.input, {
  trueSolarTime: true,
  dayBoundary: 2,
  qiyunMethod: 1,
});
const expectedPillars = {
  year: expectedChart.pillars.year,
  month: expectedChart.pillars.month,
  day: expectedChart.pillars.day,
  hour: expectedChart.pillars.hour,
};

// 假 LLM：阶段二返回基准样例，阶段三返回一句话。
let callCount = 0;
client.callMiniMax = async (messages) => {
  callCount++;
  if (messages[0].content.includes('事业推理合同')) {
    // 阶段二：把样例的四柱换成**本次输入真实排出来的四柱**。
    // 不换的话 runCareerOnce 的「四柱不得被改写」检查会判废，
    // 会话状态变成 error，冒烟就挂在「会话状态变成 ready」那一步。
    const response = JSON.parse(JSON.stringify(SAMPLE));
    response.case.pillars = expectedPillars;
    return JSON.stringify(response);
  }
  return '宜向北发展，水运是深耕专业、铺底盘的黄金阶段。';
};

// app 必须在替换 client.callMiniMax **之后**加载，否则 app 内部拿到的是原版实现。
const { createApp } = require('../src/app');

function fail(message) {
  console.error('✗ ' + message);
  process.exitCode = 1;
}

function ok(message) {
  console.log('✓ ' + message);
}

async function main() {
  const app = createApp();

  const created = await request(app).post('/api/session').send(VALID_BODY);
  if (created.status !== 202) {
    fail(`提交应返回 202，实际 ${created.status}`);
    return;
  }
  const id = created.body.sessionId;
  ok('提交返回 202，sessionId=' + id);

  if (!created.body.chart || !created.body.chart.pillars.year) {
    fail('202 响应里应带回命盘');
    return;
  }
  ok('202 响应带回命盘：' + created.body.chart.pillars.year);

  // 轮询到 ready
  let status = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    status = res.body.status;
    if (status === 'ready' || status === 'error') break;
  }
  if (status !== 'ready') {
    fail('会话应变成 ready，实际 ' + status);
    return;
  }
  ok('会话状态变成 ready');

  const chart = await request(app).get(`/api/session/${id}/chart`);
  if (!chart.body.chart) {
    fail('应能取回排盘结果');
    return;
  }
  ok('取回排盘结果');

  const career = await request(app).get(`/api/session/${id}/career`);
  if (!career.body.career || !career.body.career.prose.includes('策略总纲')) {
    fail('应能取回含散文的事业推理结果');
    return;
  }
  ok('取回事业推理结果（含散文）');

  const chat = await request(app).post('/api/chat').send({ sessionId: id, message: '我适合做什么行业？' });
  if (!chat.status || chat.status !== 200 || !chat.body.answer) {
    fail('chat 应返回 200 与回答，实际 ' + chat.status);
    return;
  }
  ok('chat 回答：' + chat.body.answer.slice(0, 30) + '…');

  const hist = await request(app).get(`/api/session/${id}/history`);
  if (!hist.body.history || hist.body.history.length !== 2) {
    fail('历史应有 2 条（用户问 + 助手答），实际 ' + (hist.body.history || []).length);
    return;
  }
  ok('对话历史记了 2 条');

  console.log('\n冒烟全部通过（共调用假 LLM ' + callCount + ' 次）');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
