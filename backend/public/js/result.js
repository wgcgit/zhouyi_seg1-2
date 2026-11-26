'use strict';

/* eslint-env browser */

/**
 * 勘验页：按 URL 上的 session 拉数据并渲染。
 * chart.html 渲染命盘，career.html 渲染事业推理结果 —— 用页面上是否存在 #careerOut 区分。
 *
 * ★ 整个文件包在 IIFE 里，一个全局变量都不往外露。
 *   chart.html 同时加载 app.js 和 result.js —— 两个都是普通 <script>，
 *   共享同一个全局作用域。若 result.js 在顶层声明 `function renderChart` /
 *   `function setMsg` / `function esc` / `const sessionId`，
 *   后加载的 result.js 会**覆盖** app.js 的同名全局：
 *     - `renderChart` 被换掉 ⇒ app.js 里那句
 *       `document.getElementById('chartSection').classList.remove('hidden')`
 *       再也不会执行（§Step 6 的 `#chartSection` 就白加了）；
 *     - `const sessionId` 这类词法声明一旦与别的脚本重名，
 *       浏览器直接抛 `SyntaxError: Identifier 'sessionId' has already been declared`，
 *       **整页白屏**。
 *   包 IIFE 就把这两类问题一起消掉。
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const msgEl = document.getElementById('msg');

  function setMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'msg error' : 'msg';
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 渲染命盘。优先用 app.js 的 renderChart（它负责解开 #chartSection 的 hidden）；
   * 没有 app.js 时（理论上只有 career.html，而它不走这条路径）才本地拼。
   */
  function renderChart(chart) {
    if (typeof window.renderChart === 'function') {
      window.renderChart(chart);
      return;
    }
    if (typeof window.renderPillars === 'function') window.renderPillars(chart);
    if (typeof window.renderDerived === 'function') window.renderDerived(chart);
    if (typeof window.renderInteractions === 'function') window.renderInteractions(chart);
    if (typeof window.renderShensha === 'function') window.renderShensha(chart);
    if (typeof window.renderAnalysis === 'function') window.renderAnalysis(chart);
    if (typeof window.renderDayun === 'function') window.renderDayun(chart);
    if (typeof window.renderLiunian === 'function') window.renderLiunian(chart);
  }

  async function loadChart() {
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/chart`);
    const json = await res.json();
    if (!res.ok) {
      setMsg((json.errors && json.errors[0]) || '加载失败', true);
      return;
    }
    renderChart(json.chart);
  }

  async function loadCareer() {
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/career`);
    const json = await res.json();
    if (!res.ok) {
      setMsg((json.errors && json.errors[0]) || '加载失败', true);
      return;
    }
    const out = document.getElementById('careerOut');
    if (!out) return;
    out.innerHTML =
      `<details class="glass-card rounded-2xl p-4 mb-4">`
      + `<summary class="font-label-sm text-label-sm text-primary cursor-pointer">结构化 JSON</summary>`
      + `<pre class="mt-3 overflow-x-auto text-xs">${esc(JSON.stringify(json.career.json, null, 2))}</pre>`
      + `</details>`
      // 散文是带换行的纯文本，用 whitespace-pre-wrap 保留换行（没有 typography 插件，不能用 prose-*）
      + `<div class="glass-card rounded-2xl p-4 whitespace-pre-wrap text-body-md font-body-md">${esc(json.career.prose)}</div>`;
  }

  async function main() {
    if (!sessionId) {
      setMsg('缺少会话编号', true);
      return;
    }
    if (document.getElementById('careerOut')) {
      await loadCareer();
    } else {
      await loadChart();
    }
  }

  main();
})();
