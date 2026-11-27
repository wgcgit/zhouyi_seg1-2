'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHAT_JS = path.join(__dirname, '..', 'public', 'js', 'chat.js');

/**
 * N-3：聊天页连点两下「发送」时，只能发**一次**请求。
 *
 * 这不是洁癖：每问一轮都会真的调一次大模型，
 * 连点两下就是两次调用、两条重复消息、两次 token 花费。
 * 之前 chat.js 没有「正在发送」的闸，也没有把按钮置灰。
 *
 * 这里真的把 chat.js 跑在 vm 里（它整体包在 IIFE 里），
 * 点两次按钮，断言 fetch 只被调了一次、且请求期间按钮是禁用的。
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

/**
 * 在 vm 里加载 chat.js，返回 { els, fetchCalls, clickSend }。
 *
 * 注意 location.search 故意留空 ⇒ sessionId 为 null ⇒ chat.js 不会去拉历史，
 * 这样 fetch 的调用次数就只可能来自「发送」这一个动作，断言才有判别力。
 */
function loadChatPage() {
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

  const fetchCalls = [];
  const sandbox = {
    document,
    console,
    fetch(url, opts) {
      fetchCalls.push({ url, opts });
      // 永远不 resolve：模拟「大模型还在思考」，请求处于进行中
      return new Promise(() => {});
    },
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
  vm.runInContext(fs.readFileSync(CHAT_JS, 'utf8'), sandbox, { filename: 'chat.js' });

  return { els, fetchCalls, sandbox };
}

/**
 * D-12：IIFE 头部的注释不能与实现自相矛盾。
 *
 * 注释原来写着「一个全局变量都不往外露」，但两个文件都挂了测试钩子。
 * 钩子本身是任务书允许的（钩子留在 IIFE 内），**要改的是注释**。
 */
describe('IIFE 注释与测试钩子一致', () => {
  const cases = [
    { file: 'chat.js', hook: 'window.__chatTest' },
    { file: 'result.js', hook: 'window.__resultTest' },
  ];

  test.each(cases)('$file 的注释不再声称「一个全局变量都不往外露」', ({ file, hook }) => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', file), 'utf8');
    expect(src).not.toContain('一个全局变量都不往外露');
    // 钩子还得在（不许顺手删掉）
    expect(src).toContain(hook);
  });
});

describe('聊天页的重复提交防护', () => {
  test('连点两下发送，只发出一次请求，且请求期间按钮被禁用', async () => {
    const { els, fetchCalls } = loadChatPage();
    const clickHandlers = els.btnSend.listeners.click || [];
    expect(clickHandlers.length).toBeGreaterThan(0);

    // 第一下：正常提问
    els['chat-input'].value = '我适合做什么行业？';
    clickHandlers[0]();
    await new Promise((r) => setImmediate(r));

    // 模拟「用户又打了一行字，又点了一下发送」——
    // 真实场景就是这个：上一次还没回来，用户就又问了一句。
    // 注意必须重新给输入框赋值：第一次发送已经把输入框清空了，
    // 如果直接再点一下，send() 会因为「输入框是空的」提前返回，
    // 那这条用例即使去掉重复提交防护也照样绿（= 没有判别力）。
    els['chat-input'].value = '那我该先做什么？';
    clickHandlers[0]();
    await new Promise((r) => setImmediate(r));

    // 关键断言：第二次必须被「正在发送」的闸挡住，只发一次请求
    expect(fetchCalls.length).toBe(1);
    // 请求还没回来 ⇒ 按钮必须是禁用的（前端能看见「正在发送」）
    expect(els.btnSend.disabled).toBe(true);
  });

  test('请求失败后按钮会恢复可点（不能一次失败就永久卡死）', async () => {
    const { els, sandbox } = loadChatPage();
    els['chat-input'].value = '我适合做什么行业？';

    // 这次 fetch 立刻返回一个失败的响应（不是抛异常，避免未处理的 rejections）
    sandbox.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({ errors: ['冒烟桩：失败'] }) });
    const clickHandlers = els.btnSend.listeners.click || [];

    clickHandlers[0]();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(els.btnSend.disabled).toBe(false);
  });
});
