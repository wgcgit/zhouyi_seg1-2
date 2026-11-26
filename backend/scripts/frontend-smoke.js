'use strict';

/**
 * 前端冒烟脚本（零新依赖：只用 Node 内置模块 + 本仓库自己的排盘引擎）。
 *
 *   cd backend && node scripts/frontend-smoke.js
 *
 * 退出码非 0 = 失败。
 *
 * 它做五件事：
 *   1. 渲染 3 组真实命盘，断言渲染结果里没有 undefined / NaN / [object Object]
 *   2. 断言渲染结果里出现新前端的标志性类（glass-card）—— 「先红后绿」的锚点
 *   3. 命盘字段注入 XSS 载荷，断言输出里没有未转义的 <script / onerror=
 *   4. 断言 esc() 转义了引号（Task 15 加的）
 *   5. 死类扫描：四个页面用到的每一个类都能在构建产物 tailwind.css 里找到（缺失必须是 0）
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BACKEND_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BACKEND_DIR, 'public');
const APP_JS = path.join(PUBLIC_DIR, 'js', 'app.js');
const CHAT_JS = path.join(PUBLIC_DIR, 'js', 'chat.js');
const RESULT_JS = path.join(PUBLIC_DIR, 'js', 'result.js');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const CHAT_HTML = path.join(PUBLIC_DIR, 'chat.html');
const CHART_HTML = path.join(PUBLIC_DIR, 'chart.html');
const CAREER_HTML = path.join(PUBLIC_DIR, 'career.html');
const TAILWIND_CSS = path.join(PUBLIC_DIR, 'css', 'tailwind.css');

// ---- 断言收集 ----
const failures = [];
let checks = 0;

function check(ok, message) {
  checks += 1;
  if (!ok) failures.push(message);
  return ok;
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

// ---- 极简 DOM shim ----
function createElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    className: '',
    style: {},
    attributes: {},
    children: [],
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); },
      remove(...names) { names.forEach(n => this._set.delete(n)); },
      contains(name) { return this._set.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !this._set.has(name) : !!force;
        if (on) this._set.add(name); else this._set.delete(name);
        return on;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    // <select> 的 options：真实浏览器里是活集合，这里用 children 顶替
    get options() { return this.children; },
  };
  return el;
}

function createDocument() {
  const registry = new Map();
  const listeners = [];
  return {
    _registry: registry,
    _listeners: listeners,
    getElementById(id) {
      if (!registry.has(id)) {
        const el = createElement('div');
        el.id = id;
        registry.set(id, el);
      }
      return registry.get(id);
    },
    createElement(tag) { return createElement(tag); },
    // 记下来但不执行 —— 免得真的去 loadCities 发网络请求
    addEventListener(type, fn) { listeners.push([type, fn]); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: createElement('body'),
  };
}

// ---- 在 vm 里跑 app.js ----
function loadApp(fetchImpl, extras) {
  const source = fs.readFileSync(APP_JS, 'utf8');
  const document = createDocument();
  const sandbox = {
    document,
    console,
    // 默认一律抛错：脚本不该真的触网；需要跑 loadCities 时显式传桩
    fetch: fetchImpl || function () { throw new Error('smoke: 不允许真实网络请求'); },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    location: { href: '' },
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
    isNaN,
    parseInt,
    parseFloat,
  };
  Object.assign(sandbox, extras || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'app.js' });
  return { sandbox, document };
}

// 造一个 sessionStorage 桩（app.js 用 window.sessionStorage）
function makeSessionStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _dump() { return Object.fromEntries(map); },
  };
}

// ---- 真实命盘（用仓库自己的离线排盘引擎算，不打网络） ----
const { buildChart } = require(path.join(BACKEND_DIR, 'src', 'chart', 'build.js'));

const SAMPLE_CHARTS = [
  {
    name: '1990-05-15 10:30 男 北京（普通盘）',
    input: {
      name: '张三', gender: 'male',
      year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0,
      province: '北京市', city: '东城区',
      trueSolarTime: true, dayBoundary: 1,
    },
    expectGanZhi: ['庚午', '辛巳', '庚辰', '辛巳'],
  },
  {
    name: '2000-02-29 08:00 女 上海（闰年 2 月 29 日）',
    input: {
      name: '李四', gender: 'female',
      year: 2000, month: 2, day: 29, hour: 8, minute: 0, second: 0,
      province: '上海市', city: '黄浦区',
      trueSolarTime: true, dayBoundary: 1,
    },
    expectGanZhi: null,
  },
  {
    name: '1990-05-15 23:30 男 北京（23 点子时盘）',
    input: {
      name: '王五', gender: 'male',
      year: 1990, month: 5, day: 15, hour: 23, minute: 30, second: 0,
      province: '北京市', city: '东城区',
      trueSolarTime: true, dayBoundary: 1,
    },
    expectGanZhi: null,
  },
];

const RENDER_TARGETS = [
  'pillars', 'derived', 'interactions', 'shensha',
  'analysis', 'dayun', 'liunian',
];

function renderChartHtml(app, chart) {
  app.sandbox.renderChart(chart);
  const doc = app.document;
  return RENDER_TARGETS.map(id => doc.getElementById(id).innerHTML).join('\n');
}

// ---- 在 vm 里跑带 IIFE 的页面脚本（chat.js / result.js） ----
// chat.js / result.js 整体包在 IIFE 里，外部拿不到内部函数，
// 所以它们在 IIFE 内部挂了测试钩子（window.__chatTest / window.__resultTest）。
// 这里真的把源码跑起来，调用渲染函数，检查大模型来的内容有没有被转义。
function loadPageScript(file, extras) {
  const source = fs.readFileSync(file, 'utf8');
  const document = createDocument();
  const sandbox = {
    document,
    console,
    fetch: function () { throw new Error('smoke: 不允许真实网络请求'); },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    // URLSearchParams 是 Web API，vm 的沙箱里没有，得显式塞进去
    URLSearchParams,
    location: { search: '' },
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
    isNaN,
    parseInt,
    parseFloat,
  };
  Object.assign(sandbox, extras || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: path.basename(file) });
  return { sandbox, document };
}

// ======================= 断言开始 =======================

section('1. 渲染 3 组真实命盘，检查 undefined / NaN / [object Object]');

const app = loadApp();
check(typeof app.sandbox.renderChart === 'function', 'app.js 必须在 vm 里暴露 renderChart');
check(typeof app.sandbox.esc === 'function', 'app.js 必须在 vm 里暴露 esc');

const allRendered = [];
for (const sample of SAMPLE_CHARTS) {
  const chart = buildChart(sample.input);
  const html = renderChartHtml(app, chart);
  allRendered.push(html);

  check(!html.includes('undefined'),
    `命盘 [${sample.name}] 的渲染结果里出现了 "undefined"`);
  check(!html.includes('NaN'),
    `命盘 [${sample.name}] 的渲染结果里出现了 "NaN"`);
  check(!html.includes('[object Object]'),
    `命盘 [${sample.name}] 的渲染结果里出现了 "[object Object]"`);

  if (sample.expectGanZhi) {
    const actual = [chart.derived.year, chart.derived.month, chart.derived.day, chart.derived.hour]
      .map(d => d.ganZhi);
    check(JSON.stringify(actual) === JSON.stringify(sample.expectGanZhi),
      `命盘 [${sample.name}] 的四柱应为 ${sample.expectGanZhi.join(' ')}，实际是 ${actual.join(' ')}`);
  }
  console.log(`  ✓ ${sample.name} 渲染了 ${html.length} 字符`);
}

section('2. 渲染结果里必须出现新前端的标志性类 glass-card');

const renderedAll = allRendered.join('\n');
check(renderedAll.includes('glass-card'),
  '渲染结果里没有 "glass-card" —— 前端还是旧皮肤');
console.log(renderedAll.includes('glass-card')
  ? '  ✓ 渲染结果包含 glass-card'
  : '  ✗ 渲染结果缺少 glass-card');

section('3. 命盘字段的 XSS 转义');

// 解读层已删除，renderInterpret 不再存在 —— 改为把恶意载荷塞进命盘字段，
// 喂 renderPillars（它对每个字段都走 esc()），断言渲染结果里没有裸标签。
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  '\'><svg onload=alert(1)>',
];

/**
 * 造一个「字段里塞了载荷」的命盘桩。
 * renderPillars 读的是 chart.derived[k].ganZhi / gan / zhi / naYin / changSheng / ganShiShen，
 * 少一个字段就会把 undefined 拼进 innerHTML，所以这里六个字段都给全。
 */
function makeXssChart(payload) {
  const derived = {};
  for (const k of ['year', 'month', 'day', 'hour']) {
    derived[k] = {
      ganZhi: payload,
      gan: payload,
      zhi: payload,
      naYin: payload,
      changSheng: payload,
      // ganShiShen 为空时 renderPillars 走「（日主）」分支，这是允许的
      ganShiShen: '',
    };
  }
  return { derived };
}

const pillarHtml = XSS_PAYLOADS.map((payload) => {
  app.sandbox.renderPillars(makeXssChart(payload));
  return app.document.getElementById('pillars').innerHTML;
}).join('\n');

check(!pillarHtml.includes('<script'),
  '命盘渲染结果里出现了未转义的 "<script"');
check(!/<[a-zA-Z][^>]*\bonerror=/.test(pillarHtml),
  '命盘渲染结果里出现了未转义的 onerror= 属性');
check(!/<[a-zA-Z][^>]*\bonload=/.test(pillarHtml),
  '命盘渲染结果里出现了未转义的 onload= 属性');
check(!pillarHtml.includes('<img'),
  '命盘渲染结果里出现了未转义的 "<img"');
check(!pillarHtml.includes('<svg'),
  '命盘渲染结果里出现了未转义的 "<svg"');
check(pillarHtml.includes('&lt;script'),
  '命盘渲染结果里没有看到 "<script" 的转义形式 &lt;script');
check(pillarHtml.includes('&lt;img'),
  '命盘渲染结果里没有看到 "<img" 的转义形式 &lt;img');
check(pillarHtml.includes('&lt;svg'),
  '命盘渲染结果里没有看到 "<svg" 的转义形式 &lt;svg');
check(!pillarHtml.includes('undefined'),
  '命盘桩缺字段，渲染结果里出现了 "undefined"');
console.log('  ✓ XSS 载荷全部被转义');

section('3b. 大模型内容渲染路径（真正执行 chat.js / result.js）');

// 复审发现：冒烟脚本原来只把 chat.js / result.js 当「类名来源」扫文本，
// 从不在 vm 里执行它们 ⇒ 有人把 `${esc(content)}` 改成 `${content}`，
// 冒烟依然全绿，而线上聊天页立刻变成存储型 XSS。
// 这里真的把源码跑起来，调用渲染函数，断言大模型来的内容被转义。
{
  // ---- chat.js ----
  const chatPage = loadPageScript(CHAT_JS, {
    fetch: async () => ({ ok: false, json: async () => ({ errors: ['冒烟桩：不该发请求'] }) }),
  });
  const chatTest = chatPage.sandbox.window.__chatTest;
  check(chatTest && typeof chatTest.appendMessage === 'function' && typeof chatTest.esc === 'function',
    'chat.js 必须在 IIFE 内部挂出 window.__chatTest = { appendMessage, esc }（测试钩子）');

  if (chatTest) {
    const messages = chatPage.document.getElementById('messages');
    chatTest.appendMessage('assistant', '<script>alert(1)</script>');
    const chatHtml = messages.children.map(c => c.innerHTML).join('\n');
    check(!chatHtml.includes('<script'),
      '聊天页渲染结果里出现了未转义的 "<script"（聊天内容来自大模型，这是存储型 XSS）');
    check(chatHtml.includes('&lt;script'),
      '聊天页渲染结果里没有看到 "<script" 的转义形式 &lt;script');

    chatTest.appendMessage('user', '"><img src=x onerror=alert(1)>');
    const chatHtml2 = messages.children.map(c => c.innerHTML).join('\n');
    check(!chatHtml2.includes('<img'),
      '聊天页渲染结果里出现了未转义的 "<img"');
    check(!/<[a-zA-Z][^>]*\bonerror=/.test(chatHtml2),
      '聊天页渲染结果里出现了未转义的 onerror= 属性');

    // M-1：服务端 content 为 null/undefined 时不能显示字面量 "undefined"
    check(chatTest.esc(null) === '', 'chat.js 的 esc(null) 必须返回空串，不能是 "null"');
    check(chatTest.esc(undefined) === '', 'chat.js 的 esc(undefined) 必须返回空串，不能是 "undefined"');
    check(!chatTest.esc(null).includes('undefined') && !chatTest.esc(undefined).includes('undefined'),
      'chat.js 的 esc() 对 null/undefined 兜底后仍出现了 "undefined"');
  }

  // ---- result.js ----
  const resultPage = loadPageScript(RESULT_JS, {
    fetch: async () => ({ ok: false, json: async () => ({ errors: ['冒烟桩：不该发请求'] }) }),
  });
  const resultTest = resultPage.sandbox.window.__resultTest;
  check(resultTest && typeof resultTest.esc === 'function' && typeof resultTest.renderCareer === 'function',
    'result.js 必须在 IIFE 内部挂出 window.__resultTest = { esc, renderCareer }（测试钩子）');

  if (resultTest) {
    const careerOut = resultPage.document.getElementById('careerOut');
    resultTest.renderCareer({
      json: { note: '<script>alert(1)</script>' },
      prose: '<script>alert(1)</script>',
    });
    const careerHtml = careerOut.innerHTML;
    check(!careerHtml.includes('<script'),
      '事业页渲染结果里出现了未转义的 "<script"（散文来自大模型，这是存储型 XSS）');
    check(careerHtml.includes('&lt;script'),
      '事业页渲染结果里没有看到 "<script" 的转义形式 &lt;script');
    check(resultTest.esc(null) === '', 'result.js 的 esc(null) 必须返回空串，不能是 "null"');
    check(resultTest.esc(undefined) === '', 'result.js 的 esc(undefined) 必须返回空串，不能是 "undefined"');
  }
}

section('4. esc() 转义引号');

const quoted = app.sandbox.esc('a"b\'c&d<e>f');
check(quoted.includes('&quot;'),
  'esc() 的输出里没有 &quot;（引号没被转义）');
check(quoted.includes('&#39;'),
  'esc() 的输出里没有 &#39;（单引号没被转义）');
check(quoted.includes('&amp;') && quoted.includes('&lt;') && quoted.includes('&gt;'),
  'esc() 没有转义 & < >');
console.log('  ✓ esc(' + JSON.stringify('a"b\'c&d<e>f') + ') = ' + quoted);

section('5. 死类扫描：页面用到的每一个类都要能在构建产物里找到');

const cssRaw = fs.readFileSync(TAILWIND_CSS, 'utf8');
// CSS 里冒号 / 斜杠 / 方括号是转义的（focus\:border-primary），比对前先去掉反斜杠
const css = cssRaw.replace(/\\/g, '');

// 从 CSS 选择器里抽出所有真正生成出来的类名
const generated = new Set();
const selectorRe = /\.((?:\\.|[A-Za-z0-9_\-])+)/g;
let m;
while ((m = selectorRe.exec(cssRaw)) !== null) {
  generated.add(m[1].replace(/\\/g, ''));
}

// 从四个页面 + 三个前端脚本里抽出用到的类名
// 三种写法都要认：
//   class="..."      —— HTML 属性
//   className = ...   —— JS 属性赋值（app.js / chat.js / result.js 的 setMsg）
//   classList.add(...) —— JS classList 形式（app.js 的 hidden 开关）
function extractUsedClasses(source) {
  const used = new Set();
  const addTokens = (text) => {
    for (const token of String(text).split(/\s+/)) {
      const t = token.trim();
      if (!t) continue;
      // 跳过模板里的动态片段
      if (/[${}`]/.test(t)) continue;
      used.add(t);
    }
  };
  // 从一段 JS 表达式里抠出所有字符串字面量（'...' / "..."）
  const addLiterals = (frag) => {
    // 先去掉比较表达式里的字面量（role === 'user' 里的 'user' 不是类名）
    const cleaned = String(frag).replace(/[=!]==?\s*('[^']*'|"[^"]*")/g, '');
    const lit = /'([^']*)'|"([^"]*)"/g;
    let lm;
    while ((lm = lit.exec(cleaned)) !== null) {
      addTokens(lm[1] !== undefined ? lm[1] : lm[2]);
    }
  };

  // 形式一：class="..."
  let mm;
  const attrRe = /class="([^"]*)"/g;
  while ((mm = attrRe.exec(source)) !== null) addTokens(mm[1]);

  // 形式二：className = <表达式>;  （表达式里可能有三元的多个字面量）
  const nameRe = /className\s*=\s*([^;]+);/g;
  while ((mm = nameRe.exec(source)) !== null) addLiterals(mm[1]);

  // 形式三：classList.add('x') / remove('x') / toggle('x')
  const listRe = /classList\.(?:add|remove|toggle)\(([^)]*)\)/g;
  while ((mm = listRe.exec(source)) !== null) addLiterals(mm[1]);

  return used;
}

const SCAN_FILES = [
  INDEX_HTML, CHAT_HTML, CHART_HTML, CAREER_HTML,
  APP_JS, CHAT_JS, RESULT_JS,
];

const used = new Set();
for (const file of SCAN_FILES) {
  for (const c of extractUsedClasses(fs.readFileSync(file, 'utf8'))) used.add(c);
}

const missing = [...used].filter(c => !generated.has(c)).sort();
check(missing.length === 0,
  `死类扫描：${missing.length} 个类在构建产物里找不到 —— ${missing.join(', ')}`);
console.log(`  总共检查 ${used.size} 个类，缺失 ${missing.length} 个`);
if (missing.length) missing.forEach(c => console.log('    缺失: ' + c));

check(cssRaw.includes('glass-card'),
  '构建产物 tailwind.css 里没有 glass-card —— 是不是没构建？');

// ---- 页面初始化默认值 ----
// 这一段要跑 loadCities（异步），所以放在最后并等它跑完再汇总。
function checkDefaults() {
  section('4b. 页面初始化默认值');

  // 表单里的默认值写在 index.html 的 value 属性里
  const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
  check(/id="name"[^>]*value="李明"/.test(indexHtml),
    'index.html 里姓名输入框的默认值不是「李明」');
  check(/id="gender"[\s\S]*?<option value="男" selected>/.test(indexHtml),
    'index.html 里性别没有默认选中「男」');
  check(/id="birthDate"[^>]*value="1990-01-15"/.test(indexHtml),
    'index.html 里出生日期的默认值不是 1990-01-15');
  check(/id="birthTime"[^>]*value="10:30"/.test(indexHtml),
    'index.html 里出生时间的默认值不是 10:30');
  // 换日方式开关默认关闭（不带 checked）——用户要求默认不启用 23:00 换日
  const dayBoundaryTag = (indexHtml.match(/<input[^>]*id="dayBoundary"[^>]*>/) || [''])[0];
  check(!!dayBoundaryTag && !/\schecked/.test(dayBoundaryTag),
    'index.html 里换日方式开关默认不是关闭状态');

  // 省市是下拉框，要用真实的城市表跑一遍 loadCities 才能验
  const { listAllKeys } = require(path.join(BACKEND_DIR, 'src', 'geo'));
  const cities = listAllKeys();
  const domApp = loadApp(async () => ({ json: async () => ({ cities }) }));
  return domApp.sandbox.loadCities().then(() => {
    const province = domApp.document.getElementById('province').value;
    const city = domApp.document.getElementById('city').value;
    check(province === '北京市',
      `省市下拉默认省份是「${province}」，应为「北京市」`);
    check(city === '东城区',
      `省市下拉默认城市是「${city}」，应为「东城区」`);
    console.log('  ✓ 默认出生地: ' + province + ' / ' + city);
  });
}

// ---- 会话持久化 / 提交失败清理旧命盘 ----
function checkSessionBehavior() {
  section('4c. 会话 id 持久化（sessionStorage）与提交失败清理旧命盘');

  const okRes = (body) => ({ ok: true, status: 200, json: async () => body });

  // 场景 1：sessionStorage 里有旧会话，/status 返回 ready
  //   → 【开始聊天】解禁，startChat 能跳回同一个会话
  const s1 = makeSessionStorage({ sessionId: 'sess-ready' });
  const app1 = loadApp(
    async () => okRes({ success: true, sessionId: 'sess-ready', status: 'ready' }),
    { sessionStorage: s1 },
  );

  return app1.sandbox.restoreSession().then(() => {
    const btn1 = app1.document.getElementById('btnStartChat');
    check(btn1.disabled === false,
      'sessionStorage 里有已就绪的会话时，【开始聊天】按钮必须解禁');
    app1.sandbox.startChat();
    check(app1.sandbox.location.href === './chat.html?session=sess-ready',
      `startChat 必须跳回同一个会话，实际是 "${app1.sandbox.location.href}"`);
    check(s1.getItem('sessionId') === 'sess-ready',
      '已就绪的会话不该被从 sessionStorage 里清掉');

    // 场景 2：sessionStorage 里有旧会话，/status 返回 error
    //   → 清掉 sessionStorage 里的 id，【开始聊天】保持禁用
    const s2 = makeSessionStorage({ sessionId: 'sess-err' });
    const app2 = loadApp(
      async () => okRes({ success: true, sessionId: 'sess-err', status: 'error', error: '炸了' }),
      { sessionStorage: s2 },
    );
    return app2.sandbox.restoreSession().then(() => {
      const btn2 = app2.document.getElementById('btnStartChat');
      check(btn2.disabled !== false,
        '会话状态为 error 时，【开始聊天】按钮必须保持禁用');
      check(s2.getItem('sessionId') === null,
        '会话状态为 error 时，必须清掉 sessionStorage 里的会话 id');

      // 场景 3：sessionStorage 里的会话已过期（404）
      //   → 清掉 id，按钮保持禁用
      const s3 = makeSessionStorage({ sessionId: 'sess-gone' });
      const app3 = loadApp(
        async () => ({ ok: false, status: 404, json: async () => ({ success: false, errors: ['会话不存在或已过期'] }) }),
        { sessionStorage: s3 },
      );
      return app3.sandbox.restoreSession().then(() => {
        const btn3 = app3.document.getElementById('btnStartChat');
        check(btn3.disabled !== false,
          '会话 404 时，【开始聊天】按钮必须保持禁用');
        check(s3.getItem('sessionId') === null,
          '会话 404 时，必须清掉 sessionStorage 里的会话 id');

        // 场景 4：sessionStorage 读不到（file:// 等环境会抛异常）
        //   → 当作没有旧会话，不能抛错
        const boom = {
          getItem() { throw new Error('SecurityError: sessionStorage 不可用'); },
          setItem() { throw new Error('SecurityError: sessionStorage 不可用'); },
          removeItem() { throw new Error('SecurityError: sessionStorage 不可用'); },
        };
        const app4 = loadApp(async () => okRes({ status: 'ready' }), { sessionStorage: boom });
        return app4.sandbox.restoreSession().then(() => {
          const btn4 = app4.document.getElementById('btnStartChat');
          check(btn4.disabled !== false,
            'sessionStorage 不可用时，【开始聊天】按钮必须保持禁用');
          check(app4.document.getElementById('msg').textContent === '',
            'sessionStorage 不可用且没有旧会话时，不该显示任何提示文案');

          // 场景 5：提交失败 → 上一张命盘必须被隐藏
          const s5 = makeSessionStorage({});
          const app5 = loadApp(
            async () => ({ ok: false, status: 400, json: async () => ({ success: false, errors: ['提交失败，请检查出生信息'] }) }),
            { sessionStorage: s5 },
          );
          const chartSection5 = app5.document.getElementById('chartSection');
          // 先模拟「上一张命盘已经渲染出来」
          chartSection5.classList.remove('hidden');
          return app5.sandbox.submitSession().then(() => {
            check(chartSection5.classList.contains('hidden'),
              '提交失败后，页面上不能残留上一张命盘（#chartSection 必须带 hidden）');

            // 场景 6：提交成功 → 记住会话 id
            const chart = buildChart(SAMPLE_CHARTS[0].input);
            const s6 = makeSessionStorage({});
            const app6 = loadApp(
              async () => okRes({ success: true, sessionId: 'sess-new', status: 'pending', chart }),
              { sessionStorage: s6, setTimeout(fn) { fn(); return 0; } },
            );
            return app6.sandbox.submitSession().then(() => {
              check(s6.getItem('sessionId') === 'sess-new',
                `提交成功后必须把会话 id 写进 sessionStorage，实际是 ${s6.getItem('sessionId')}`);
            });
          });
        });
      });
    });
  });
}

checkDefaults().then(checkSessionBehavior).then(() => {
  section('结果');
  console.log(`断言总数 ${checks}，失败 ${failures.length}`);
  if (failures.length) {
    console.log('\n失败明细：');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  }
  console.log('\n全部通过 ✅');
});
