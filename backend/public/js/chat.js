'use strict';

/* eslint-env browser */

/**
 * 聊天页。
 * ★ 整个文件包在 IIFE 里，业务代码不往外露全局变量。
 *   `chat.js` 的 `setMsg` / `esc` / `sessionId` 与 `app.js` 同名；
 *   将来若某个页面同时引两个脚本，顶层同名声明会互相覆盖，
 *   `const` 同名更是直接抛 SyntaxError 让整页白屏。包 IIFE 就没这问题。
 *   唯一的例外是文件末尾挂的测试钩子 `window.__chatTest` ——
 *   它是为了让冒烟脚本能在 vm 里真正执行这里的渲染逻辑（验证大模型内容的转义），
 *   只在 IIFE 内部挂，不影响页面上的全局作用域。
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');

  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('chat-input');
  const msgEl = document.getElementById('msg');
  const sendBtn = document.getElementById('btnSend');

  /** 正在等大模型回答 —— 连点两下会多烧一次调用，用它挡住重复提交 */
  let sending = false;

  function setMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'msg error' : 'msg';
  }

  /** 转义后再拼进 innerHTML —— 回答来自大模型，不能直接塞 */
  function esc(v) {
    // 服务端 content 可能是 null/undefined，兜底成空串，别显示字面量 "undefined"
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendMessage(role, content) {
    const wrap = document.createElement('div');
    wrap.className = role === 'user' ? 'self-end' : 'self-start';
    wrap.innerHTML = `<div class="glass-card rounded-2xl px-4 py-3 max-w-[85%]">${esc(content)}</div>`;
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadHistory() {
    if (!sessionId) return;
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/history`);
    const json = await res.json();
    if (res.ok && Array.isArray(json.history)) {
      for (const m of json.history) appendMessage(m.role, m.content);
    }
  }

  async function send() {
    // 上一次还没回来就再点 ⇒ 直接忽略，别多烧一次大模型调用
    if (sending) return;
    const message = inputEl.value.trim();
    if (!message) return;
    inputEl.value = '';
    appendMessage('user', message);
    setMsg('思考中…');
    sending = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg((json.errors && json.errors[0]) || '问答失败，请重试', true);
        return;
      }
      setMsg('');
      appendMessage('assistant', json.answer);
    } finally {
      // 无论成功失败都恢复按钮 —— 否则一次失败后按钮永远点不动
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  document.getElementById('btnSend').addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  document.getElementById('btnChartResult').addEventListener('click', () => {
    window.open(`./chart.html?session=${encodeURIComponent(sessionId)}`, '_blank', 'noopener');
  });
  document.getElementById('btnCareerResult').addEventListener('click', () => {
    window.open(`./career.html?session=${encodeURIComponent(sessionId)}`, '_blank', 'noopener');
  });

  if (!sessionId) {
    setMsg('缺少会话编号，请从输入页重新提交', true);
  } else {
    loadHistory();
  }

  // ---- 测试钩子（只给冒烟脚本用）----
  // 本文件整体包在 IIFE 里，外部拿不到内部函数；
  // 冒烟脚本要真正执行这里的渲染逻辑来验证 XSS 转义，
  // 所以在 IIFE 内部挂一个钩子。名字与 app.js 的顶层变量不冲突。
  window.__chatTest = { appendMessage, esc };
})();
