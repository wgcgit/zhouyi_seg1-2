'use strict';

/* eslint-env browser */

/**
 * 聊天页。
 * ★ 整个文件包在 IIFE 里，一个全局变量都不往外露。
 *   `chat.js` 的 `setMsg` / `esc` / `sessionId` 与 `app.js` 同名；
 *   将来若某个页面同时引两个脚本，顶层同名声明会互相覆盖，
 *   `const` 同名更是直接抛 SyntaxError 让整页白屏。包 IIFE 就没这问题。
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');

  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('chat-input');
  const msgEl = document.getElementById('msg');

  function setMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'msg error' : 'msg';
  }

  /** 转义后再拼进 innerHTML —— 回答来自大模型，不能直接塞 */
  function esc(v) {
    return String(v)
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
    const message = inputEl.value.trim();
    if (!message) return;
    inputEl.value = '';
    appendMessage('user', message);
    setMsg('思考中…');

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
  }

  document.getElementById('btnSend').addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  document.getElementById('btnChartResult').addEventListener('click', () => {
    window.open(`./chart.html?session=${encodeURIComponent(sessionId)}`, '_blank');
  });
  document.getElementById('btnCareerResult').addEventListener('click', () => {
    window.open(`./career.html?session=${encodeURIComponent(sessionId)}`, '_blank');
  });

  if (!sessionId) {
    setMsg('缺少会话编号，请从输入页重新提交', true);
  } else {
    loadHistory();
  }
})();
