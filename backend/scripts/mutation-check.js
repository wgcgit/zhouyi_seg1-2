'use strict';

/**
 * 变异验证 —— 一次跑多个变异，每次把被测模块换成「改坏」的副本，
 * 跑仓库里**原封不动**的测试文件，看哪些断言变红。
 *
 * 用法：node scripts/mutation-check.js <case>
 *   case = render | run | session | app | chat | contract
 *
 * 副本放在仓库外的临时目录里，且把它内部的相对 require 全部改写成绝对路径，
 * 这样副本仍能引用真实的同级模块，而仓库本身一个字节都不动。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.join(__dirname, '..');
const SANDBOX = path.join(BACKEND, '..', '.superpowers', 'sdd', 'mutsandbox');

function sh(args, opts) {
  // jest 的汇总行写到 stderr，所以 stdout/stderr 必须合起来看
  const r = spawnSync(process.execPath, args, Object.assign({ encoding: 'utf8' }, opts || {}));
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function mutate(source, pairs) {
  let out = source;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error('变异锚点找不到：' + JSON.stringify(from.slice(0, 60)));
    out = out.replace(from, to);
  }
  return out;
}

/** 把副本里的相对 require 改写成绝对路径（相对原文件的目录解析） */
function absolutizeRequires(code, originalDir) {
  return code.replace(/require\((['"])(\.[^'"]*)\1\)/g, (m, q, spec) => {
    const abs = path.resolve(originalDir, spec);
    return 'require(' + q + abs.replace(/\\/g, '/') + q + ')';
  });
}

function runJest(name, testFile, modulePath, extraTests) {
  const mapper = {};
  const mutant = path.join(SANDBOX, name, 'mutant.js').replace(/\\/g, '/');
  mapper['^' + modulePath.replace(/\\/g, '/') + '$'] = mutant;
  // 测试文件常用另一种写法定位同一个模块（require.resolve('../src/xxx')），
  // 这些别名也要一起指到副本，否则源码扫描类的守门在变异下永远扫的是原文件。
  for (const alias of moduleAliases[modulePath] || []) {
    mapper['^' + alias.replace(/\\/g, '/') + '$'] = mutant;
  }
  const args = [
    path.join(BACKEND, 'node_modules', 'jest', 'bin', 'jest.js'),
    '--config', JSON.stringify({
      rootDir: BACKEND,
      testEnvironment: 'node',
      testMatch: ['**/tests/**/*.test.js'],
      testTimeout: 20000,
      // 沙箱副本在仓库外，node_modules 解析不到 —— 把 backend/node_modules 显式挂上
      modulePaths: [path.join(BACKEND, 'node_modules').replace(/\\/g, '/')],
      moduleNameMapper: mapper,
    }),
    testFile, '--silent',
  ].concat(extraTests || []);
  return sh(args, { cwd: BACKEND });
}

function summarize(out) {
  const m = out.match(/Tests:\s+(.*)/);
  const names = [];
  const re = /^\s*●\s+(.+)$/gm;
  let mm;
  while ((mm = re.exec(out)) !== null) names.push(mm[1].trim());
  return { summary: m ? m[1].trim() : '(没解析出 Tests 行)', failedNames: names };
}

/**
 * 同一个模块在测试里的其它写法（别名）。
 *
 * 测试文件有时用 require.resolve('../src/xxx') 定位模块，
 * 而被测代码用相对写法 require('./xxx')。
 * 只映射一种写法 ⇒ 源码扫描类的守门扫的是原文件，不是副本 ⇒ 变异下永远绿（没有判别力）。
 */
const moduleAliases = {
  './routes/session': ['../src/routes/session'],
  './routes/chat': ['../src/routes/chat'],
  '../src/career/run': [],
};

const CASES = {
  render: {
    file: path.join(BACKEND, 'src', 'career', 'render.js'),
    modulePath: '../src/career/render',
    test: 'tests/career-render.test.js',
    mutations: [
      { name: 'M1 相邻语义改成全局合并', pairs: [[
        'if (last && last.type === step.type) {',
        'if (groups.some((g) => g.type === step.type)) {',
      ]] },
      { name: 'M2 返回值去掉 branches', pairs: [[
        'groups.push({ type: step.type, steps: [step], branches: BRANCHES_BY_TYPE[step.type] });',
        'groups.push({ type: step.type, steps: [step] });',
      ]] },
      { name: 'M3 joinList 去掉数组守卫', pairs: [[
        "return Array.isArray(items) ? items.join('、') : '';",
        "return (items || []).join('、');",
      ]] },
      { name: 'M4 去掉顶层兜底', pairs: [['data = data || {};', '// 变异：去掉顶层兜底']] },
      { name: 'M5 asArray 退化成只挡 null', pairs: [[
        'function asArray(value) {\n  return Array.isArray(value) ? value : [];\n}',
        'function asArray(value) {\n  return value || [];\n}',
      ]] },
    ],
  },
  session: {
    file: path.join(BACKEND, 'src', 'routes', 'session.js'),
    modulePath: './routes/session',
    test: 'tests/session.test.js',
    extraTests: ['tests/api-errors.test.js'],
    mutations: [
      { name: 'S1 提交返回码 202 改 200', pairs: [[
        "res.status(202).json({ success: true, sessionId, status: 'pending', chart });",
        "res.status(200).json({ success: true, sessionId, status: 'pending', chart });",
      ]] },
      { name: 'S2 阶段二成功后不置 ready', pairs: [[
        "session.status = 'ready';",
        "session.status = 'pending';",
      ]] },
      { name: 'S3 阶段二失败不置 error', pairs: [[
        "session.status = 'error';",
        "session.status = 'pending';",
      ]] },
      { name: 'S4 事业结果未完成时不返回 404（改成 200 + null）', pairs: [[
        "if (!session.career) {",
        "if (false) {",
      ]] },
      { name: 'S5 追加历史时不校验 role/content', pairs: [[
        "if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {",
        "if (false) {",
      ]] },
      { name: 'S6 会话不存在时返回 404 改 500（status 路由）', pairs: [[
        "if (!session) {\n    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });\n  }\n  res.json({\n    success: true,\n    sessionId: session.id,",
        "if (!session) {\n    return res.status(500).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });\n  }\n  res.json({\n    success: true,\n    sessionId: session.id,",
      ]] },
      { name: 'S7 追加历史响应里的 count 恒为 1', pairs: [[
        'res.json({ success: true, count: session.history.length });',
        'res.json({ success: true, count: 1 });',
      ]] },
      // ---- Task 12 新增的守门 ----
      { name: 'S8 [D-4] session 路由不共用排盘 options（退回各自复制）', pairs: [[
        'chart = buildChart(input, chartOptionsFrom(req.body));',
        'chart = buildChart(input, chartOptionsFrom({}));',
      ]] },
      { name: 'S9 [D-2] 追加历史时不校验单条消息长度', pairs: [[
        'if (content.trim().length > MAX_MESSAGE_LENGTH) {',
        'if (false) {',
      ]] },
      { name: 'S10 [D-5] 排盘失败时返回 500 而不是 400', pairs: [[
        "console.error(API_ERRORS.LOG_CHART_FAILED, chineseError(error && error.message, CHART_ERROR_FALLBACK));\n    return res.status(400).json({",
        "console.error(API_ERRORS.LOG_CHART_FAILED, chineseError(error && error.message, CHART_ERROR_FALLBACK));\n    return res.status(500).json({",
      ]] },
      { name: 'S11 [D-6] GET /:id/chart 的 404 改 500', pairs: [[
        "if (!session) {\n    return res.status(404).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });\n  }\n  res.json({ success: true, chart: session.chart });",
        "if (!session) {\n    return res.status(500).json({ success: false, errors: [API_ERRORS.SESSION_NOT_FOUND] });\n  }\n  res.json({ success: true, chart: session.chart });",
      ]] },
      { name: 'S12 [N-1] 会话编号退回 Date.now + Math.random', pairs: [[
        "return 'sess_' + crypto.randomUUID();",
        "return 'sess_' + Date.now() + '_' + Math.random();",
      ]] },
      { name: 'S13 [N-2] 过期清理跳过 pending 会话', pairs: [[
        'if (now - lastActiveAt > SESSION_TTL_MS) SESSIONS.delete(id);',
        'if (s.status !== \'pending\' && now - lastActiveAt > SESSION_TTL_MS) SESSIONS.delete(id);',
      ]] },
      { name: 'S14 [N-2] 访问会话不刷新最后活跃时间', pairs: [[
        'session.lastActiveAt = Date.now();',
        '/* 变异：不刷新最后活跃时间 */',
      ]] },
      { name: 'S15 [D-3] 把 404 文案改回裸的中文字面量', pairs: [[
        'errors: [API_ERRORS.SESSION_NOT_FOUND]',
        "errors: ['会话不存在或已过期']",
      ]] },
    ],
  },
  app: {
    file: path.join(BACKEND, 'src', 'app.js'),
    modulePath: '../src/app',
    test: 'tests/session.test.js',
    extraTests: ['tests/chat.test.js'],
    mutations: [
      { name: 'A1 不把会话表挂到 app.locals.sessions', pairs: [[
        'app.locals.sessions = sessionRouter.SESSIONS;',
        '// 变异：不挂 app.locals.sessions',
      ]] },
    ],
  },
  chat: {
    file: path.join(BACKEND, 'src', 'routes', 'chat.js'),
    modulePath: './routes/chat',
    test: 'tests/chat.test.js',
    extraTests: ['tests/api-errors.test.js'],
    mutations: [
      { name: 'C1 会话还在推理中时不再返回 409', pairs: [[
        "if (session.status !== 'ready' || !session.career) {",
        'if (false) {',
      ]] },
      { name: 'C2 模型报错时返回 500 改 200', pairs: [[
        'return res.status(500).json({\n      success: false,\n      errors: [toChineseError(error)],',
        'return res.status(200).json({\n      success: false,\n      errors: [toChineseError(error)],',
      ]] },
      { name: 'C3 模型报错时透出英文原文', pairs: [[
        'errors: [toChineseError(error)],',
        'errors: [String((error && error.message) || error)],',
      ]] },
      { name: 'C4 模型返回空内容时返回 500 改 200', pairs: [[
        'return res.status(500).json({ success: false, errors: [API_ERRORS.LLM_EMPTY_ANSWER] });',
        'return res.status(200).json({ success: false, errors: [API_ERRORS.LLM_EMPTY_ANSWER] });',
      ]] },
      { name: 'C5 不把本轮问答写回会话历史', pairs: [[
        "session.history.push({ role: 'user', content: message });",
        '/* 变异：不写回用户消息 */',
      ], [
        "session.history.push({ role: 'assistant', content: answer });",
        '/* 变异：不写回助手消息 */',
      ]] },
      { name: 'C6 把本轮提问提前写进历史', pairs: [[
        'const raw = await client.callMiniMax([',
        "session.history.push({ role: 'user', content: message }); const raw = await client.callMiniMax([",
      ]] },
      { name: 'C7 缺少会话编号时不返回 400', pairs: [[
        'if (!sessionId) {',
        'if (false) {',
      ]] },
      { name: 'C8 提示语为空时不返回 400', pairs: [[
        'if (!message) {',
        'if (false) {',
      ]] },
      { name: 'C9 409 文案固定化（丢掉 session.error 透出）', pairs: [[
        'errors: [session.error || API_ERRORS.CHAT_CAREER_PENDING],',
        'errors: [API_ERRORS.CHAT_CAREER_PENDING],',
      ]] },
      { name: 'C10 只挡 pending（error 态会话放行）', pairs: [[
        "if (session.status !== 'ready' || !session.career) {",
        "if (session.status === 'pending' || !session.career) {",
      ]] },
      { name: 'C11 prompt 的 JSON 段丢失（两次都传散文）', pairs: [[
        'buildChatSystemPrompt(session.career.json, session.career.prose)',
        'buildChatSystemPrompt(session.career.prose, session.career.prose)',
      ]] },
      { name: 'C12 prompt 的散文段丢失（两次都传 JSON）', pairs: [[
        'buildChatSystemPrompt(session.career.json, session.career.prose)',
        'buildChatSystemPrompt(session.career.json, session.career.json)',
      ]] },
      // ---- Task 12 新增的守门 ----
      { name: 'C13 [D-1] 去掉 prompt 预算预检（超预算也照调模型）', pairs: [[
        'if (systemPrompt.length + userPrompt.length > MAX_PROMPT_CHARS) {',
        'if (false) {',
      ]] },
      { name: 'C14 [D-2] 提问长度上限失效', pairs: [[
        'if (message.length > MAX_MESSAGE_LENGTH) {',
        'if (false) {',
      ]] },
      { name: 'C15 [D-1] 预算上限写成天文数字（挡不住长对话）', pairs: [[
        'const MAX_PROMPT_CHARS = 120000;',
        'const MAX_PROMPT_CHARS = 100000000;',
      ]] },
      { name: 'C16 [D-3] 把 409 文案改回裸的中文字面量', pairs: [[
        'errors: [session.error || API_ERRORS.CHAT_CAREER_PENDING],',
        "errors: [session.error || '事业推理尚未完成，请稍后再问'],",
      ]] },
    ],
  },
  run: {
    file: path.join(BACKEND, 'src', 'career', 'run.js'),
    modulePath: '../src/career/run',
    test: 'tests/career-run.test.js',
    mutations: [
      { name: 'M1 catch 分支透出英文原文', pairs: [[
        'defects: [chineseError(error)]',
        'defects: [String((error && error.message) || error)]',
      ]] },
      { name: 'M2 四柱键名改回写死', pairs: [[
        'for (const k of PILLAR_KEYS) {\n      if (typeof modelPillars[k] === \'string\'',
        'for (const k of [\'year\', \'month\', \'day\', \'hour\']) {\n      if (typeof modelPillars[k] === \'string\'',
      ]] },
      { name: 'M3 [D-8] 去掉「命盘缺四柱就判废」（先调模型再判）', pairs: [[
        'if (!hasCompletePillars(chartPillars)) {',
        'if (false) {',
      ]] },
      { name: 'M4 [D-7] 四柱比对只比年柱', pairs: [[
        'for (const k of PILLAR_KEYS) {\n      if (typeof modelPillars[k] === \'string\'',
        'for (const k of [\'year\']) {\n      if (typeof modelPillars[k] === \'string\'',
      ]] },
      { name: 'M5 [D-9] 四柱完整性只判「是不是对象」', pairs: [[
        "if (!pillars || typeof pillars !== 'object') return false;\n  for (const k of PILLAR_KEYS) {\n    if (typeof pillars[k] !== 'string' || !pillars[k].trim()) return false;\n  }",
        "if (!pillars || typeof pillars !== 'object') return false;",
      ]] },
      { name: 'M6 [终审] 确定性缺陷不再提前返回（恢复成重试三轮）', pairs: [[
        "    if (r.fatal) {\n      console.error('事业推理结果不符合契约（本地检查判定，不再重试）:', defects.join('、'));\n      return { data: null, prose: '', parsed, defects, fatal: true };\n    }",
        '    // 变异：去掉 fatal 提前返回',
      ]] },
    ],
  },
  contract: {
    file: path.join(BACKEND, 'src', 'career', 'run.js'),
    modulePath: '../src/career/run',
    test: 'tests/career-contract-source.test.js',
    mutations: [
      { name: 'K1 [D-10] 契约源缺失时抛裸 ENOENT（不翻成中文）', pairs: [[
        'throw describeContractSourceError(error);',
        'throw error;',
      ]] },
      { name: 'K2 [D-10] ENOENT 不再翻译（直接原样返回）', pairs: [[
        "if (error && error.code === 'ENOENT') {",
        'if (false) {',
      ]] },
    ],
  },
};

function main() {
  const which = process.argv[2];
  const c = CASES[which];
  if (!c) {
    console.error('用法：node scripts/mutation-check.js render|run|session|app|chat|contract');
    process.exit(2);
  }
  fs.mkdirSync(SANDBOX, { recursive: true });

  const source = fs.readFileSync(c.file, 'utf8');
  const dir0 = path.dirname(c.file);

  console.log('===== 基线（无变异）=====');
  // 基线也要有一份「副本」存在，moduleNameMapper 才有东西可指
  fs.mkdirSync(path.join(SANDBOX, 'baseline'), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, 'baseline', 'mutant.js'), absolutizeRequires(source, dir0), 'utf8');
  const base = runJest('baseline', c.test, c.modulePath, c.extraTests);
  const b = summarize(base.out);
  console.log('Tests: ' + b.summary);
  if (!base.ok) {
    console.log('基线就是红的！输出：');
    console.log(base.out.slice(-5000));
    process.exit(1);
  }

  for (const mut of c.mutations) {
    const key = mut.name.replace(/[^A-Za-z0-9]/g, '_');
    console.log('\n===== ' + mut.name + ' =====');
    let code;
    try {
      code = absolutizeRequires(mutate(source, mut.pairs), dir0);
    } catch (e) {
      console.log('!! 变异失败：' + e.message);
      continue;
    }
    fs.mkdirSync(path.join(SANDBOX, key), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX, key, 'mutant.js'), code, 'utf8');
    const res = runJest(key, c.test, c.modulePath, c.extraTests);
    const s = summarize(res.out);
    console.log('Tests: ' + s.summary);
    if (s.failedNames.length) {
      console.log('变红的断言：');
      s.failedNames.slice(0, 12).forEach((n) => console.log('  - ' + n));
      if (s.failedNames.length > 12) console.log('  …（共 ' + s.failedNames.length + ' 条）');
    } else {
      console.log('!! 全绿 —— 这个变异**没被抓住**（测试没有判别力）');
    }
  }
}

main();
