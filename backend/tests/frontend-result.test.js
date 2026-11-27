'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RESULT_JS = path.join(__dirname, '..', 'public', 'js', 'result.js');

/**
 * 事业勘验页的散文渲染。
 *
 * 服务端 render.js 产出的是 Markdown（`## 标题` / `- 条目` / 普通行），
 * 前端要把它渲染成 HTML，**但不能开 XSS 口子** ——
 * 散文内容来自大模型，是不可信输入。
 *
 * 这里真的把 result.js 跑在 vm 里（它整体包在 IIFE 里），
 * 调用它挂出来的 window.__resultTest.renderMarkdown。
 */

/** 造一个够用的 DOM 元素桩 */
function makeEl(id) {
  return {
    id,
    value: '',
    textContent: '',
    className: '',
    innerHTML: '',
    children: [],
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

/** 在 vm 里加载 result.js，返回 { els, sandbox, md } */
function loadResultPage() {
  const els = {};
  const document = {
    getElementById(id) {
      if (!els[id]) els[id] = makeEl(id);
      return els[id];
    },
    createElement(tag) {
      return makeEl(tag);
    },
  };

  const sandbox = {
    document,
    console,
    fetch: async () => ({ ok: false, json: async () => ({ errors: ['桩：不该发请求'] }) }),
    URLSearchParams,
    location: { search: '' },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    Error,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RESULT_JS, 'utf8'), sandbox, { filename: 'result.js' });

  return { els, sandbox, md: sandbox.window.__resultTest };
}

describe('散文的极简 Markdown 渲染', () => {
  test('## 标题渲染成 h2', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('## 八字命例\n男命，己巳年。');
    expect(html).toContain('<h2');
    expect(html).toContain('八字命例');
    expect(html).not.toContain('## ');
  });

  test('### 小标题渲染成 h3', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('### 调候\n燥热局。');
    expect(html).toContain('<h3');
    expect(html).toContain('调候');
  });

  test('- 条目渲染成无序列表', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('  - 2020年 动手\n  - 2021年 守成');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('2020年 动手');
    expect(html).toContain('2021年 守成');
    // 列表项不该再留着 "- " 前缀
    expect(html).not.toContain('- 2020年');
  });

  test('**加粗**渲染成 strong', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('这是**重点**内容。');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).not.toContain('**');
  });

  test('同一段里的多行用 <br> 连起来，空行才分段', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('喜：水；\n次喜：丙火；\n忌：叠土。\n\n另起一段。');
    expect(html).toContain('喜：水；<br>次喜：丙火；<br>忌：叠土。');
    expect(html).toContain('<p');
    // 两段 ⇒ 两个 <p>
    expect((html.match(/<p/g) || []).length).toBe(2);
  });

  test('空散文不炸', () => {
    const { md } = loadResultPage();
    expect(md.renderMarkdown('')).toBe('');
    expect(md.renderMarkdown(null)).toBe('');
    expect(md.renderMarkdown(undefined)).toBe('');
  });
});

describe('散文渲染的安全边界', () => {
  test('正文里的 <script> 被转义，不会变成真标签', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('## 标题\n<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script');
  });

  test('标题里的恶意标签同样被转义', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('## <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\bonerror=/);
  });

  test('列表项里的恶意标签同样被转义', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('- <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\bonerror=/);
  });

  test('加粗标记里塞 HTML 也不能变成真标签', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('**<script>alert(1)</script>**');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script');
  });

  test('引号与尖括号都被转义（不留属性注入的口子）', () => {
    const { md } = loadResultPage();
    const html = md.renderMarkdown('"><img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;');
  });

  test('renderCareer 整体输出里没有裸的 script 标签', () => {
    const { els, md } = loadResultPage();
    md.renderCareer({
      json: { note: '<script>alert(1)</script>' },
      prose: '## 标题\n<script>alert(1)</script>',
    });
    const html = els.careerOut.innerHTML;
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script');
    // 结构化 JSON 仍然在可折叠的 details 里
    expect(html).toContain('<details');
    // 散文现在渲染成了 h2
    expect(html).toContain('<h2');
  });
});
