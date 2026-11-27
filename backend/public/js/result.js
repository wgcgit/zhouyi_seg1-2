'use strict';

/* eslint-env browser */

/**
 * 勘验页：按 URL 上的 session 拉数据并渲染。
 * chart.html 渲染命盘，career.html 渲染事业推理结果 —— 用页面上是否存在 #careerOut 区分。
 *
 * ★ 整个文件包在 IIFE 里，业务代码不往外露全局变量。
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
 *   唯一的例外是文件末尾挂的测试钩子 `window.__resultTest` ——
 *   它是为了让冒烟脚本能在 vm 里真正执行这里的渲染逻辑（验证大模型内容的转义），
 *   只在 IIFE 内部挂，不影响页面上的全局作用域。
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
    // 服务端 prose 可能是 null/undefined，兜底成空串，别显示字面量 "undefined"
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 行内标记：**加粗** → <strong>。
   *
   * 入参**必须已经过 esc()** —— 因为它会往文本里插标签，
   * 没转义的文本就等于开了一个 XSS 口子。
   *
   * @param {string} escaped 已转义的行内文本
   * @returns {string}
   */
  function inlineMarkdown(escaped) {
    return String(escaped).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  /**
   * 极简 Markdown → HTML。
   *
   * 只认三样东西（服务端 render.js 就只产出这三样）：
   *   - `## 标题` / `### 小标题` → 标题
   *   - `- 条目`                   → 无序列表
   *   - 其余每一行                → 段落（同一段里的多行用 <br> 连起来）
   *
   * ⚠️ **安全顺序**：先对整行做 esc()，再套标签。
   *    esc() 之后文本里不可能再有 `<` `>`，所以插进去的标签是安全的；
   *    反过来做（先套标签再转义）会把标签本身也转义掉。
   *
   * @param {string} markdown 散文（Markdown）
   * @returns {string} HTML
   */
  function renderMarkdown(markdown) {
    const lines = String(markdown === null || markdown === undefined ? '' : markdown).split(/\r?\n/);
    const blocks = [];
    let para = [];
    let list = [];

    function flushPara() {
      if (para.length) {
        blocks.push('<p class="mt-2 mb-0">' + para.join('<br>') + '</p>');
        para = [];
      }
    }
    function flushList() {
      if (list.length) {
        blocks.push(
          '<ul class="mt-2 mb-2 list-disc pl-6">'
          + list.map((li) => '<li class="my-0.5">' + li + '</li>').join('')
          + '</ul>',
        );
        list = [];
      }
    }

    for (const raw of lines) {
      // 先转义，后面所有插标签的操作都在已转义的文本上进行
      const escaped = esc(raw);
      const t = escaped.trim();
      if (!t) {
        // 空行 = 段落分隔
        flushPara();
        flushList();
        continue;
      }
      const heading = /^(#{2,3})\s+(.*)$/.exec(t);
      if (heading) {
        flushPara();
        flushList();
        // 类名写成**完整字面量**：前端冒烟脚本的「死类扫描」是按 class 属性
        // 抠类名的，把类名拆成变量拼接会被它抠出一堆 '+' / 变量名当类名。
        if (heading[1].length === 2) {
          blocks.push(
            '<h2 class="font-title-md text-title-md text-primary mt-7 mb-2 first:mt-0">'
            + inlineMarkdown(heading[2]) + '</h2>',
          );
        } else {
          blocks.push(
            '<h3 class="font-title-md text-title-md text-on-surface mt-5 mb-1 first:mt-0">'
            + inlineMarkdown(heading[2]) + '</h3>',
          );
        }
        continue;
      }
      const item = /^[-*]\s+(.*)$/.exec(t);
      if (item) {
        flushPara();
        list.push(inlineMarkdown(item[1]));
        continue;
      }
      flushList();
      para.push(inlineMarkdown(t));
    }
    flushPara();
    flushList();
    return blocks.join('');
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

  /**
   * 渲染事业结果（结构化 JSON + 散文）。
   * 散文是大模型生成的，必须走 esc() 转义后才能拼进 innerHTML。
   */
  function renderCareer(career) {
    const out = document.getElementById('careerOut');
    if (!out) return;
    out.innerHTML =
      `<details class="glass-card rounded-2xl p-4 mb-4">`
      + `<summary class="font-label-sm text-label-sm text-primary cursor-pointer">结构化 JSON</summary>`
      + `<pre class="mt-3 overflow-x-auto text-xs">${esc(JSON.stringify(career.json, null, 2))}</pre>`
      + `</details>`
      // 散文是 Markdown，走 renderMarkdown 渲染（内部先 esc() 再套标签）。
      // 没有 typography 插件，不能用 prose-*。
      + `<div class="glass-card rounded-2xl p-4 text-body-md font-body-md text-on-surface">`
      + renderMarkdown(career.prose)
      + `</div>`;
  }

  async function loadCareer() {
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/career`);
    const json = await res.json();
    if (!res.ok) {
      setMsg((json.errors && json.errors[0]) || '加载失败', true);
      return;
    }
    renderCareer(json.career);
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

  // ---- 测试钩子（只给冒烟脚本用）----
  // 本文件整体包在 IIFE 里，外部拿不到内部函数；
  // 冒烟脚本要真正执行这里的渲染逻辑来验证大模型内容的转义，
  // 所以在 IIFE 内部挂一个钩子。名字与 app.js 的顶层变量不冲突。
  window.__resultTest = { esc, renderCareer, renderMarkdown, inlineMarkdown };
})();
