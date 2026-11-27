'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 扫描源码里的字符串字面量，找出**含中文**的字面量（跳过注释）。
 *
 * 注释里当然有中文 —— 那是给人看的；这里只关心会进入响应的字符串。
 * 支持 '...' "..." `...` 三种引号。
 *
 * @param {string} source 源码文本
 * @returns {string[]} 含中文的字面量
 */
function findChineseLiterals(source) {
  const hits = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const ch = source[i];
    // 行注释
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }
    // 块注释
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < n && source[j] !== quote) {
        if (source[j] === '\\') {
          buf += source[j + 1] || '';
          j += 2;
          continue;
        }
        buf += source[j];
        j += 1;
      }
      if (/[一-龥]/.test(buf)) hits.push(buf);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return hits;
}

/**
 * 被扫描的两个路由。
 *
 * 用 require.resolve 定位「真正被加载的那一份」——
 * 变异验证会把改坏的副本映射成这个模块，源码扫描必须扫同一份，
 * 否则这条守门在变异下永远看不见（= 没有判别力）。
 */
const TARGETS = [
  { file: 'session.js', modulePath: '../src/routes/session' },
  { file: 'chat.js', modulePath: '../src/routes/chat' },
];

describe('API 错误文案的唯一来源', () => {
  test('session.js 与 chat.js 里不再出现裸的中文字面量', () => {
    for (const t of TARGETS) {
      const src = fs.readFileSync(require.resolve(t.modulePath), 'utf8');
      // 把文件名一起放进断言值里，失败时能直接看出是哪个文件散落回去了
      expect({ file: t.file, hits: findChineseLiterals(src) }).toEqual({ file: t.file, hits: [] });
    }
  });

  test('session.js 与 chat.js 都从 api-errors.js 取文案', () => {
    for (const t of TARGETS) {
      const src = fs.readFileSync(require.resolve(t.modulePath), 'utf8');
      // 只看模块名，不看 require 的具体写法（变异工具会把相对路径改写成绝对路径）
      const hasRequire = /require\((['"]).*api-errors\1\)/.test(src);
      expect({ file: t.file, hasRequire }).toEqual({ file: t.file, hasRequire: true });
    }
  });

  test('api-errors.js 存在，且导出的文案逐字不变', () => {
    const p = path.join(__dirname, '..', 'src', 'routes', 'api-errors.js');
    expect(fs.existsSync(p)).toBe(true);
    const { API_ERRORS, MAX_MESSAGE_LENGTH } = require('../src/routes/api-errors');
    // 前端 result.js 按 404 的文案分流 ⇒ 这些字一个都不能动
    expect(API_ERRORS.SESSION_NOT_FOUND).toBe('会话不存在或已过期');
    expect(API_ERRORS.SESSION_CAREER_PENDING).toBe('事业推理尚未完成');
    expect(API_ERRORS.CHAT_CAREER_PENDING).toBe('事业推理尚未完成，请稍后再问');
    expect(API_ERRORS.HISTORY_FORMAT_INVALID).toBe('消息格式不正确');
    expect(API_ERRORS.MISSING_SESSION_ID).toBe('缺少会话编号');
    expect(API_ERRORS.EMPTY_MESSAGE).toBe('请输入问题');
    // 单条消息长度上限（chat 与 history 追加共用一个数）
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
  });
});
