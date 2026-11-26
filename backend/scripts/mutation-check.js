'use strict';

/**
 * 变异验证 —— 一次跑多个变异，每次把被测模块换成「改坏」的副本，
 * 跑仓库里**原封不动**的测试文件，看哪些断言变红。
 *
 * 用法：node scripts/mutation-check.js <case>
 *   case = render | run | session | app
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
  mapper['^' + modulePath.replace(/\\/g, '/') + '$'] = path.join(SANDBOX, name, 'mutant.js').replace(/\\/g, '/');
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
      { name: 'S6 会话不存在时返回 404 改 500', pairs: [[
        "res.status(404).json({ success: false, errors: ['会话不存在或已过期'] })",
        "res.status(500).json({ success: false, errors: ['会话不存在或已过期'] })",
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
    mutations: [
      { name: 'C1 会话还在推理中时不再返回 409', pairs: [[
        "if (session.status !== 'ready' || !session.career) {",
        'if (false) {',
      ]] },
      { name: 'C2 模型报错时返回 500 改 200', pairs: [[
        'return res.status(500).json({',
        'return res.status(200).json({',
      ]] },
      { name: 'C3 模型报错时透出英文原文', pairs: [[
        'errors: [toChineseError(error)],',
        'errors: [String((error && error.message) || error)],',
      ]] },
      { name: 'C4 模型返回空内容时返回 500 改 200', pairs: [[
        "return res.status(500).json({ success: false, errors: ['大模型没有返回内容，请稍后重试'] });",
        "return res.status(200).json({ success: false, errors: ['大模型没有返回内容，请稍后重试'] });",
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
        'for (const k of PILLAR_KEYS) {',
        "for (const k of ['year', 'month', 'day', 'hour']) {",
      ]] },
      { name: 'M3 去掉「命盘缺四柱就判废」', pairs: [[
        "if (!chartPillars || typeof chartPillars !== 'object') {",
        'if (false) {',
      ]] },
    ],
  },
};

function main() {
  const which = process.argv[2];
  const c = CASES[which];
  if (!c) {
    console.error('用法：node scripts/mutation-check.js render|run|session|app');
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
