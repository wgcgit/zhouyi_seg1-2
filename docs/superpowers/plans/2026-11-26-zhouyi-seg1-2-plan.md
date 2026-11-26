# 周易之易 · 事业推盘 + 事业问答 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `zhouyi_seg1_v2` 的离线排盘引擎与 `zhouyi_seg2` 的事业择业 skill 知识库，整合成一个单页产品：输入八字 → 离线排盘 → 结构化事业推理结果 → 散文文档 → chatbot 问答。

**Architecture:** 四层。
- **L1 排盘层**：从 v2 逐字拷贝的离线引擎，产出 12 字段命盘 JSON。**零改动**。
- **L2 契约层**：`docs/CAREER_SCHEMA.md` 是**唯一手写源**（13 键 + 内嵌机读 JSON Schema 块）；`backend/prompts/CAREER_SCHEMA.md` 由脚本生成；校验器常量**从源解析**。运行时校验 LLM 输出的 JSON。
- **L3 推理层**：新写的 `prompt.js`（多段 skill 提取器 + 阶段二/阶段三两套 prompt 组装）+ `career/validate.js`（契约校验）+ `career/render.js`（JSON → 散文）。
- **L4 服务层**：`routes/session.js`（阶段一同步 + 阶段二异步编排）、`routes/chat.js`（阶段三问答），会话存内存 Map。

**Tech Stack:** Node.js 18+ / Express 4 / Jest 29 / supertest 6 / `lunar-javascript@1.7.8`（MIT，零依赖）。前端沿用 v1/v2 的原生 HTML/JS + 本地构建 Tailwind。

**上游来源**：`D:\Software\ClaudeCodeProject\zhouyi_seg1_v2`（排盘引擎）、`D:\Software\ClaudeCodeProject\zhouyi_seg2`（事业 skill 库）。

**设计规格（本计划的唯一依据）**：`docs/superpowers/specs/2026-11-26-zhouyi-seg1-2-design.md`

---

## Global Constraints

这些约束**每个 Task 都必须遵守**。

### A. 已确认的用户决策（12 条）

1. **整合方式**：v2 出排盘、seg2 出事业解读、chatbot 回答事业问题、两个新 tab 勘验。
2. **不移植 v2 的解读层**。v2 只贡献离线排盘；`routes/interpret.js`、`client.js` 里的解读 Schema 校验、10 段解读、`prompts/INTERPRET_*.md` 全部不参与本产品。
3. **阶段二先输出 JSON，再渲染成散文文档**。
4. **chat 上下文** = 本命事业推理结果 + 五个 skill 的通用知识。
5. **输入页【提交】+【开始聊天】两按钮**，后台算完才可点。
6. **调候层由 LLM 自行判定**（离线层不新增节气/调候计算）。
7. **契约对齐基准**：`《事业推理结果.txt》` 作骨架 + 补齐 `事业1/3/4` 的知识。
8. **新增 4 键**：`careerPhases` / `directions` / `patternTracks` / 保留 `summary`。
9. **`tiaoHou.secondaryDrug` 以 txt 为准**（丙火），不取六大气机口径（柔金）。
10. **`shiye-master.skill.md` 拷贝后改写**其「输出规范」「Interpretation」「Execution」三段（写死了 10 键，与 13 键契约矛盾；Interpretation 段那处键序也会被注入 prompt，必须一起改）。
11. **契约文档单一源 + 生成**。
12. **`patternTracks.byCombination` 可空**。

### B. 13 键契约（**唯一权威，三处必须逐字一致**）

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

三处一致：
- `docs/CAREER_SCHEMA.md` 的机读 JSON Schema 块的 `required` 数组顺序
- `backend/src/career/schema.js` 从源解析出的 `TOP_LEVEL_KEYS`
- `backend/skills/bazi-tuipan/shiye-master.skill.md` 的「输出规范」推进顺序 + 「Execution」步序

### C. 8 组闭合枚举（不得自造）

| 字段路径 | 取值 |
|---|---|
| `pattern.verdict` | `成格` / `破格` / `不清` |
| `tiaoHou.climateType` | `寒局` / `燥热局` / `湿重局` / `燥硬局` / `春木旺局` / `秋金肃局` |
| `tiaoHou.drugStatus` | `真药` / `藏药` / `假药` |
| `playbooks[].scale` | `早期` / `轻创业` / `重资产` / `合伙` |
| `timeline[].type` | `水运` / `木运` / `火运` / `土运` / `金运` |
| `timeline[].verdict` | `重仓` / `轻试` / `守成` |
| `timeline[].liunianWindows[].action` | `宜` / `忌` |
| `summary.strategy` | `主业重仓` / `底盘待机` / `守成缓投` |

**两处 `verdict` 枚举不可混用**：`pattern.verdict` 说的是格局成败，`timeline[].verdict` 说的是该运的策略。

### D. 必填 / 可空

| 路径 | 要求 |
|---|---|
| `xiJi.xi` / `xiJi.ji` | 必非空数组 |
| `xiJi.ciXi` | **可空**（次喜是加分项，不得为凑满而编造） |
| `boundaries` / `playbooks` / `playbooks[].actions` | 必非空数组 |
| `timeline` / `timeline[].liunianWindows` / `summary.notes` | 必非空数组 |
| `patternTracks.byPattern` | 必非空数组 |
| `patternTracks.byCombination` | **可空** |
| `directions` | 必非空数组 |
| `careerPhases.early` / `careerPhases.later` | 必填字符串，**不得为空串** |

### E. 拷贝与不可改

- **逐字拷贝，零改动**：`zhouyi_seg1_v2/backend/src/{calendar,core,analyze,fortune,geo,chart}/`、`backend/src/routes/{paipan,normalize-input,error-text}.js`、`backend/skills/bazi-tuipan/` 的 16 个基线 skill、`zhouyi_seg2` 的 4 个事业子 skill。
- **拷贝后需改动**（仅两处）：
  - `backend/src/llm/client.js` —— 删掉解读层专有部分（`REQUIRED_INTERPRET_KEYS` / `REQUIRED_INTERPRET_FIELDS` / `INTERPRET_ARRAY_SPECS` / `interpretDefects` / `validateInterpret`），保留 `callMiniMax` / `parseLLMJson` / `friendlyError` / 括号容错解析。
  - `backend/skills/bazi-tuipan/shiye-master.skill.md` —— 按 Task 2 改写「输出规范」「Interpretation」「Execution」三段。
- **`参考资料/` 5 份 txt 逐字不可改**。
- **不拷贝**：`routes/interpret.js`、`prompts/INTERPRET_*.md`、`zhouyi_seg1_v2/backend/src/llm/prompt.js`（重写）、v2 的解读页前端。

### F. 编码规范

- 所有源文件首行 `'use strict';`，CommonJS `require` / `module.exports`。
- 注释与错误提示用中文；标识符用英文。
- 每个源文件**只做一件事**。
- 测试用 Jest 的 `describe`/`test`，断言用中文场景名。
- **新增/修改的断言必须先红后绿**。不允许靠调断言数值让测试变绿；数字对不上时，先报告实际数字，再修实现。
- 提交粒度 = 一个 Task 一次提交，commit message 用 `feat:` / `fix:` / `test:` / `chore:` / `docs:` 前缀，**中文描述**。

### G. 环境约束

- **凭据不进 Git**：`backend/.env` 必须写进 `.gitignore`；`MINIMAX_API_KEY` 只从环境变量读。
- npm 源用 `https://registry.npmmirror.com`（本机 GitHub / CDN 不可达，npm registry 走镜像可用）。
- 城市经纬度表**离线生成后落盘为 JSON**，运行时不联网。
- **禁止在仓库里跑 `git push`**：本机 `github.com:443` 直连时通时不通，且推 GitHub 需起本地 CONNECT 代理（`127.0.0.1:8899`）。推送由主控在阶段结束时统一做。
- **不要 `git add` `node_modules/`**（已在 `.gitignore`）。

### H. 实测数字（**不要用估计值**，这些是核实过的）

- 4 个事业子 skill 的 Interpretation 段合计 **11618** 字符（tiaohou 2972 / geshi 2485 / suiyun 2394 / wuxing 1703）
- `shiye-master.skill.md` 各段：输出规范 560 / Interpretation 2038 / 子Skill清单 303 / Execution 1083 / A2 98 / Boundary 217
- 命盘 JSON **25369** 字符；`CAREER_SCHEMA.sample.json`（seg2 版）**1247** 字符
- `zhouyi_seg1_v2/backend/src/llm/prompt.js` 共 **124 行**
- 阶段二 prompt 预估 **40k+ 字符** —— 若触顶，先砍命盘 JSON 的 `shensha` / `lunar` / `interactions` 部分，**但 `strength` / `pattern` / `fortune` 三段必须保留**

---

## File Structure

```
zhouyi_seg1-2/
├── 参考资料/                                   # 5 份原始 txt，逐字不可改
├── docs/
│   ├── CAREER_SCHEMA.md                        # ★ 唯一手写源：13 键契约（人读 + 内嵌机读 JSON Schema 块）
│   ├── CAREER_SCHEMA.sample.json               # 基准用例期望输出（戊辰 己未 乙亥 乙酉 男命，13 键）
│   ├── SHIYE_MASTER_DIFF.md                    # shiye-master 三段改写的前后对照与理由
│   └── superpowers/
│       ├── specs/2026-11-26-zhouyi-seg1-2-design.md
│       └── plans/2026-11-26-zhouyi-seg1-2-plan.md   # 本文件
├── package.json                                # 根：前后端一起跑
├── .gitignore
├── tailwind.config.js                          # 从 v2 逐字拷贝
└── backend/
    ├── package.json
    ├── jest.config.js
    ├── .env.example
    ├── scripts/
    │   ├── gen-city-coords.js                  # 从 v2 拷贝
    │   ├── xcheck-derived.js                   # 从 v2 拷贝
    │   ├── frontend-smoke.js                   # 从 v2 拷贝（改断言指向新页面）
    │   ├── build-career-schema.js              # ★ 新写：从 docs/CAREER_SCHEMA.md 生成 backend/prompts/CAREER_SCHEMA.md
    │   └── validate-career-schema.js           # ★ 新写：校验生成物与源一致
    ├── prompts/
    │   ├── CAREER_PROMPT.md                    # ★ 新写：事业推理合同（行为约束 + 字段指引）
    │   └── CAREER_SCHEMA.md                    # ★ 生成物（勿手改）
    ├── src/
    │   ├── calendar/ core/ analyze/ fortune/ geo/ chart/   # 从 v2 逐字拷贝
    │   ├── llm/
    │   │   ├── client.js                       # 从 v2 拷贝后删解读层部分
    │   │   └── prompt.js                       # ★ 新写：多段提取器 + 两套 prompt 组装
    │   ├── career/
    │   │   ├── schema.js                       # ★ 新写：从 docs/CAREER_SCHEMA.md 解析契约常量
    │   │   ├── validate.js                     # ★ 新写：JSON 契约校验器
    │   │   └── render.js                       # ★ 新写：JSON → 散文文档
    │   ├── routes/
    │   │   ├── paipan.js normalize-input.js error-text.js   # 从 v2 拷贝
    │   │   ├── session.js                      # ★ 新写：阶段一 + 阶段二编排
    │   │   └── chat.js                         # ★ 新写：阶段三问答
    │   ├── app.js                              # 从 v2 拷贝后删解读层挂载（Task 1 Step 1b）+ 改挂载（Task 8/9）
    │   └── server.js                           # 从 v2 拷贝
    ├── skills/bazi-tuipan/                     # 16 基线（v2）+ 5 事业（seg2），master 三段改写
    ├── public/
    │   ├── index.html chat.html chart.html career.html
    │   ├── css/{style.css,tailwind.css,tailwind.src.css}     # 从 v2 拷贝
    │   └── js/{app.js,chat.js,result.js}
    └── tests/
```

---

## Task 1: 搭骨架 —— 拷贝离线引擎与 skill 基线

**Files:**
- Create: `package.json`、`.gitignore`、`tailwind.config.js`
- Create: `backend/package.json`、`backend/jest.config.js`、`backend/.env.example`
- Copy（逐字，零改动）: `backend/src/{calendar,core,analyze,fortune,geo,chart}/`、`backend/src/routes/{paipan,normalize-input,error-text}.js`、`backend/src/app.js`、`backend/src/server.js`、`backend/scripts/{gen-city-coords.js,xcheck-derived.js}`、`backend/skills/bazi-tuipan/` 的 16 个基线 skill、`backend/public/css/`、`backend/public/index.html`、`backend/public/js/app.js`
- Copy: `backend/tests/` 里除解读层外的测试（`analysis/calendar/derived/fortune/geo/input-validation/interactions/pillars/shensha/api`）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `buildChart(input, options)` → 命盘 JSON（12 字段）；`normalizeInput(body)` → `{errors, input}`；`createApp()` → Express app；`POST /api/paipan/chart`、`GET /api/paipan/cities`、`GET /api/paipan/schema`、`GET /api/health`

- [ ] **Step 1: 拷贝目录骨架**

在 `D:\Software\ClaudeCodeProject\zhouyi_seg1-2` 下执行：

```bash
SRC=../zhouyi_seg1_v2
mkdir -p backend/src/llm backend/src/career backend/src/routes \
         backend/prompts backend/scripts backend/skills \
         backend/public/css backend/public/js backend/tests docs

cp -r $SRC/backend/src/calendar $SRC/backend/src/core $SRC/backend/src/analyze \
      $SRC/backend/src/fortune $SRC/backend/src/geo $SRC/backend/src/chart backend/src/
cp $SRC/backend/src/routes/paipan.js $SRC/backend/src/routes/normalize-input.js \
   $SRC/backend/src/routes/error-text.js backend/src/routes/ 2>/dev/null || {
  mkdir -p backend/src/routes
  cp $SRC/backend/src/routes/paipan.js $SRC/backend/src/routes/normalize-input.js \
     $SRC/backend/src/routes/error-text.js backend/src/routes/
}
cp $SRC/backend/src/app.js $SRC/backend/src/server.js backend/src/
cp $SRC/backend/scripts/gen-city-coords.js $SRC/backend/scripts/xcheck-derived.js backend/scripts/
cp -r $SRC/backend/public/css/* backend/public/css/
cp $SRC/backend/public/index.html backend/public/
cp $SRC/backend/public/js/app.js backend/public/js/
cp -r $SRC/backend/skills/bazi-tuipan backend/skills/
cp $SRC/tailwind.config.js .
```

> `backend/src/routes/` 在 v2 里存在，`cp` 直接成功；上面的 `||` 分支只是防 `cp` 因目录不存在而中断整条命令——实际执行时若第一个 `cp` 成功就不会走分支。

- [ ] **Step 1b: 把 `app.js` 里的解读层路由摘掉（必须做，否则整个后端起不来）**

v2 的 `app.js` 第 7 行 `const interpretRouter = require('./routes/interpret');`
与第 26 行 `app.use('/api/interpret', interpretRouter);` 指向**本产品不拷贝**的路由文件 ——
不摘掉的话 `require('./src/app')` 直接抛 MODULE_NOT_FOUND，**所有测试文件都起不来**。

在 `backend/src/app.js` 里删掉这两行：

```javascript
// 删掉这一行：
const interpretRouter = require('./routes/interpret');
```

```javascript
// 删掉这一行：
app.use('/api/interpret', interpretRouter);
```

删完确认（应无输出）：

```bash
cd backend && grep -n "interpret" src/app.js
```

> `app.js` 的其余部分（`/api/paipan` 挂载、中文 404、中文错误处理、静态文件）**逐字不动**。
> 解读层的路由与校验在 Task 6 / Task 8 再动 `client.js` 与 `app.js` 的其他部分。
> `api.test.js` 里**没有** `/api/interpret` 的断言，删掉路由不影响它。

- [ ] **Step 2: 拷贝测试（排除解读层）**

```bash
for t in analysis calendar derived fortune geo input-validation interactions pillars shensha api; do
  cp $SRC/backend/tests/$t.test.js backend/tests/
done
ls backend/tests/
```

预期列出 10 个文件，**不含** `interpret.test.js` / `interpret-prompt-failure.test.js` / `llm.test.js` / `llm-attempts.test.js` / `llm-truncation.test.js`（这 5 个是解读层的，本产品不需要）。

- [ ] **Step 2b: 改写 `input-validation.test.js`（必须做，否则 Step 7 不可能全绿）**

v2 的 `input-validation.test.js` 有 **36 条断言**，其中 **19 条打的是 `/api/interpret`** ——
而 Step 1b 恰好把那个路由摘了。**原样拷贝过来跑，实测是 19 failed / 17 passed**：
```
● 非法日期必须被 400 拦掉 › interpret 路由：2024 年 2 月 31 日 返回 400 与中文错误
● 数组 / 对象 / 布尔值不得蒙混过关 › year 为数组时 interpret 返回 400
● 两个路由的校验等价性 › paipan 与 interpret 对「2 月 31 日」给出的 errors 完全一致
……（共 19 条，全部是 interpret 相关）
```
另外它顶部有 `jest.mock('../src/llm/client', …)`，而 **`client.js` 要到 Task 6 才拷进来** ——
不处理的话连测试文件都加载不了（`Cannot find module '../src/llm/client'`）。

**本产品的等价性基准换成 `/api/paipan` 与 `/api/session`**（后者是 Task 8 建的），
但 Task 1 阶段 `/api/session` 还不存在，所以**分两步走**：

**Task 1 这一步只做「去掉 interpret、去掉 llm mock」**：

把 `backend/tests/input-validation.test.js` 改写成下面这份（**逐字替换整个文件**）：

```javascript
'use strict';

// 入参校验的回归测试：非法日期、数组值、类型与长度限制。
// 本产品不移植解读层（无 /api/interpret），所以这里只测 /api/paipan 一条路由。
// 「两个路由的校验等价性」在 Task 8 由 session.test.js 接手（/api/paipan vs /api/session）。

const request = require('supertest');
const { createApp } = require('../src/app');

const VALID = {
  name: '张三', gender: 'male',
  year: 1990, month: 5, day: 15,
  hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

const BAD_DATES = [
  { label: '2024 年 2 月 31 日', body: { year: 2024, month: 2, day: 31 } },
  { label: '4 月 31 日', body: { month: 4, day: 31 } },
  { label: '6 月 31 日', body: { month: 6, day: 31 } },
  { label: '平年 2023 年 2 月 29 日', body: { year: 2023, month: 2, day: 29 } },
];

describe('非法日期必须被 400 拦掉', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  for (const c of BAD_DATES) {
    test(`paipan 路由：${c.label} 返回 400 与中文错误`, async () => {
      const res = await request(app).post('/api/paipan/chart').send({ ...VALID, ...c.body });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0]).toMatch(/[一-龥]/);
    });
  }

  test('闰年 2024 年 2 月 29 日是合法日期，paipan 放得过', async () => {
    const res = await request(app)
      .post('/api/paipan/chart')
      .send({ ...VALID, year: 2024, month: 2, day: 29 });
    expect(res.status).toBe(200);
  });
});

describe('数组 / 对象 / 布尔值不得蒙混过关', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  const BAD_YEARS = [
    { label: '数组', value: [1990] },
    { label: '布尔', value: true },
    { label: '对象', value: { year: 1990 } },
  ];

  for (const b of BAD_YEARS) {
    test(`year 为${b.label}时 paipan 返回 400`, async () => {
      const res = await request(app).post('/api/paipan/chart').send({ ...VALID, year: b.value });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatch(/[一-龥]/);
    });
  }

  test('month 为数组时同样被拦掉', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, month: [5] });
    expect(res.status).toBe(400);
  });

  test('day 为数组时同样被拦掉', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, day: [15] });
    expect(res.status).toBe(400);
  });
});

describe('姓名与省市的类型、长度限制（B-4）', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  test('超长 name 被 400 拦掉且错误是中文', async () => {
    const long33 = '张三'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: long33 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/[一-龥]/);
  });

  test('超长 province 被 400 拦掉', async () => {
    const long33 = '北京'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, province: long33 });
    expect(res.status).toBe(400);
  });

  test('超长 city 被 400 拦掉', async () => {
    const long33 = '东城'.repeat(17);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, city: long33 });
    expect(res.status).toBe(400);
  });

  test('name 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: 123 });
    expect(res.status).toBe(400);
  });

  test('province 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, province: 123 });
    expect(res.status).toBe(400);
  });

  test('city 为非字符串时报中文错误', async () => {
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, city: 123 });
    expect(res.status).toBe(400);
  });

  test('长度恰好 32 的 name 放得过', async () => {
    const name32 = '张'.repeat(32);
    const res = await request(app).post('/api/paipan/chart').send({ ...VALID, name: name32 });
    expect(res.status).toBe(200);
  });
});
```

> **改动清单**：删掉顶部 `jest.mock('../src/llm/client', …)` 与 `const { callMiniMax } = require('../src/llm/client');`
> （`client.js` 要到 Task 6 才存在，留着就 `Cannot find module`）；
> 删掉全部 19 条 `interpret 路由` / `paipan 与 interpret 的 errors 完全一致` 断言；
> 保留 17 条针对 `/api/paipan` 的断言（非法日期、类型蒙混、长度限制）。
>
> **「两个路由校验等价性」不能就此丢掉** —— Task 8 会用 `/api/paipan` 与 `/api/session`
> 各出一条非法输入、断言两者 `errors` 完全一致（见 Task 8 Step 1）。
>
> **不要为了让它绿而删更多断言。** 上面的 16 条要**全部保留**；
> 若某条真的挂了，是实现的问题，报上来，不要改断言。
>
> **已实测**：按上面的文件改写后，Task 1 状态下（**没有** `backend/src/llm/`）
> 这个测试文件 **17/17 全绿**；连同其余 9 个拷贝过来的测试文件，
> Task 1 结束时是 **10 个测试文件 / 265 个测试全绿**。

- [ ] **Step 3: 写根 `package.json`**

`package.json`：

```json
{
  "name": "zhouyi-seg1-2",
  "version": "0.1.0",
  "private": true,
  "description": "周易之易 · 事业推盘 + 事业问答 —— 整合 v2 离线排盘与 seg2 事业择业 skill",
  "scripts": {
    "postinstall": "npm --prefix backend install",
    "install:all": "npm --prefix backend install",
    "test": "npm --prefix backend test",
    "start": "npm --prefix backend run start",
    "build:css": "npm --prefix backend run build:css",
    "build:schema": "npm --prefix backend run build:schema",
    "validate:schema": "npm --prefix backend run validate:schema",
    "gen:coords": "npm --prefix backend run gen:coords",
    "xcheck": "npm --prefix backend run xcheck",
    "smoke:frontend": "npm --prefix backend run smoke:frontend"
  }
}
```

- [ ] **Step 4: 写 `backend/package.json`**

从 v2 拷贝后改三处（依赖不变，`scripts` 增删两项）：

```json
{
  "name": "zhouyi-seg1-2-backend",
  "version": "0.1.0",
  "private": true,
  "description": "周易之易 · 事业推盘后端",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "jest",
    "build:css": "tailwindcss -c ../tailwind.config.js -i public/css/tailwind.src.css -o public/css/tailwind.css --minify",
    "build:schema": "node scripts/build-career-schema.js",
    "validate:schema": "node scripts/validate-career-schema.js",
    "smoke:frontend": "node scripts/frontend-smoke.js",
    "gen:coords": "node scripts/gen-city-coords.js",
    "xcheck": "node scripts/xcheck-derived.js"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "lunar-javascript": "1.7.8"
  },
  "devDependencies": {
    "astrology-china-locations": "^1.1.1",
    "chinese-global-compliant-geodata": "^1.0.0",
    "echarts-china-cities-js": "^0.1.1",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "tailwindcss": "^3.4.17"
  }
}
```

- [ ] **Step 5: 写 `backend/jest.config.js` 与 `.gitignore` 与 `.env.example`**

`backend/jest.config.js`（与 v2 逐字相同）：

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  testTimeout: 20000,
};
```

`.gitignore`（仓库根）：

```
node_modules/
backend/.env
backend/.jobs/
*.log
.DS_Store
docs/.tmp-compress/
.superpowers/
```

`backend/.env.example`：

```
MINIMAX_API_KEY=
MINIMAX_MODEL=MiniMax-M3
MINIMAX_THINKING=disabled
MINIMAX_MAX_TOKENS=32768
MINIMAX_MAX_ATTEMPTS=3
MINIMAX_TIMEOUT_MS=300000
MINIMAX_CAREER_ROUNDS=3
PORT=3000
```

- [ ] **Step 6: 装依赖**

```bash
npm run install:all
```

预期：`npm --prefix backend install` 成功，无报错。

- [ ] **Step 7: 跑测试确认基线绿**

```bash
npm test
```

预期：**10 个测试文件 / 265 个测试全绿**（已实测）。
若 `api.test.js` 失败，多半是 `backend/public/index.html` 或 `app.js` 的路径断言——检查拷贝是否完整。
若报 `Cannot find module './routes/interpret'`，回 Step 1b 把那两行摘掉。
若 `input-validation.test.js` 报 `Cannot find module '../src/llm/client'`，说明 Step 2b 没做。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "chore: 搭骨架 —— 拷入 v2 离线排盘引擎与 16 个基线 skill"
```

---

## Task 2: 事业 skill 落盘 + 改写 `shiye-master` 三段

**Files:**
- Create: `backend/skills/bazi-tuipan/{tiaohou-shiye,geshi-shiye,wuxing-shiye,suiyun-shiye}/SKILL.md` + `shiye-master.skill.md`（从 seg2 拷贝）
- Create: `backend/skills/bazi-tuipan/shiye-master/test-prompts.json`（从 seg2 拷贝）
- Modify: `backend/skills/bazi-tuipan/shiye-master.skill.md` 的「输出规范」「Interpretation」「Execution」三段
- Create: `docs/SHIYE_MASTER_DIFF.md`
- Test: `backend/tests/shiye-master.test.js`

**Interfaces:**
- Consumes: 无（纯文件任务）
- Produces:
  - `backend/skills/bazi-tuipan/tiaohou-shiye/SKILL.md` 等 4 个子 skill，含 `## Interpretation（核心方法论）` 段
  - `backend/skills/bazi-tuipan/shiye-master.skill.md`，含 `## 输出规范`、`## Interpretation（核心方法论）`、`## Execution（执行步骤）` 三段，其中三段内的**所有 10 键键序串**都已按 13 键改写

> **重要：「Interpretation」段内也有一处 10 键键序串（`shiye-master.skill.md` 第 43 行，`**输出键序以 docs/CAREER_SCHEMA.md 为准**：case → … → summary`）。**
> 该段会被 `buildCareerSystemPrompt()` 注入 system prompt，不改它模型就会同时看到 10 键与 13 键两套键序。
> 所以本任务改写**三段**（不是两段），共 **6 处**。

- [ ] **Step 1: 拷贝 5 个事业 skill**

```bash
SEG2=../zhouyi_seg2
for s in tiaohou-shiye geshi-shiye wuxing-shiye suiyun-shiye; do
  mkdir -p backend/skills/bazi-tuipan/$s
  cp $SEG2/skills/bazi-tuipan/$s/SKILL.md backend/skills/bazi-tuipan/$s/
  cp $SEG2/skills/bazi-tuipan/$s/test-prompts.json backend/skills/bazi-tuipan/$s/
done
cp $SEG2/skills/bazi-tuipan/shiye-master.skill.md backend/skills/bazi-tuipan/
mkdir -p backend/skills/bazi-tuipan/shiye-master
cp $SEG2/skills/bazi-tuipan/shiye-master/test-prompts.json backend/skills/bazi-tuipan/shiye-master/
ls backend/skills/bazi-tuipan/ | grep -E "shiye|wuxing-shiye|geshi-shiye|tiaohou|suiyun"
```

预期列出 `geshi-shiye`、`shiye-master`、`shiye-master.skill.md`、`suiyun-shiye`、`tiaohou-shiye`、`wuxing-shiye`。

- [ ] **Step 2: 写失败的测试**

`backend/tests/shiye-master.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const MASTER_PATH = path.join(__dirname, '..', 'skills', 'bazi-tuipan', 'shiye-master.skill.md');

/** 取 `## <heading>` 到下一个 `## ` 之间的正文 */
function section(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 3);
  const end = rest.search(/\n##\s/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

const TOP_LEVEL_KEYS = [
  'case', 'monthCommand', 'pattern', 'patternTracks', 'careerPhases', 'tiaoHou',
  'xiJi', 'boundaries', 'directions', 'playbooks', 'timeline', 'transition', 'summary',
];

describe('shiye-master 的三段已按 13 键契约改写', () => {
  const md = fs.readFileSync(MASTER_PATH, 'utf8');

  test('「输出规范」的推进顺序就是 13 键契约的键序', () => {
    const spec = section(md, '输出规范（固化在此文件，必须严格遵守）');
    expect(spec).toContain('推进顺序');
    // 逐个键按顺序出现，且顺序不乱
    let cursor = -1;
    for (const key of TOP_LEVEL_KEYS) {
      const at = spec.indexOf(key, cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test('「输出规范」不再说 10 个顶层键', () => {
    const spec = section(md, '输出规范（固化在此文件，必须严格遵守）');
    expect(spec).not.toContain('10 个顶层键');
    expect(spec).toContain('13 个顶层键');
  });

  test('「Execution」的步序覆盖全部 13 个键，且每个键都被点名', () => {
    const exec = section(md, 'Execution（执行步骤）');
    for (const key of TOP_LEVEL_KEYS) {
      expect(exec).toContain(`填 \`${key}\``);
    }
  });

  test('「Execution」的产出校验说的是 13 个顶层键', () => {
    const exec = section(md, 'Execution（执行步骤）');
    expect(exec).not.toContain('10 个顶层键');
    expect(exec).toContain('13 个顶层键');
  });

  test('三个新键各有独立的一步，且带正确的键名', () => {
    const exec = section(md, 'Execution（执行步骤）');
    expect(exec).toContain('填 `patternTracks`');
    expect(exec).toContain('填 `careerPhases`');
    expect(exec).toContain('填 `directions`');
  });

  test('「Interpretation」段里的 10 键键序串已改成 13 键', () => {
    // 这一行会被注入 system prompt，不改模型就会看到两套键序
    const interp = section(md, 'Interpretation（核心方法论）');
    expect(interp).not.toContain('case → monthCommand → pattern → tiaoHou');
    expect(interp).toContain('case → monthCommand → pattern → patternTracks');
  });

  test('「Interpretation」段的方法论内容与「Boundary」段保持 seg2 原样', () => {
    // Interpretation 只改那一行键序，其余方法论逐字保留；Boundary 完全不改
    const interp = section(md, 'Interpretation（核心方法论）');
    expect(interp).toContain('四层叠加，不是四选一');
    expect(interp).toContain('契约落笔口径');
    expect(section(md, 'Boundary（边界）')).toContain('不重排四柱');
  });

  // ↓↓↓ 下面这条守的是本任务最核心的不变量 ↓↓↓
  test('两处键序串逐字相同，且都是一行（不许折行）', () => {
    // 「输出规范」段的推进顺序（``` 代码块里）与「Interpretation」段的
    // 「输出键序以 docs/CAREER_SCHEMA.md 为准：…」是**同一份键序串**。
    // 两处只要有一处折行、或分隔符不一致，下次改契约就很容易只改到一处 ——
    // 而模型运行期会把两段都注入 system prompt，于是同时看到两套键序。
    // 所以这里不比「键名顺序」，比**整串逐字相同**。
    const KEY_ORDER = [
      'case', 'monthCommand', 'pattern', 'patternTracks', 'careerPhases',
      'tiaoHou', 'xiJi', 'boundaries', 'directions', 'playbooks',
      'timeline', 'transition', 'summary',
    ].join(' → ');

    // 第一处：「输出规范」段里 ``` 代码块中的推进顺序
    const spec = section(md, '输出规范（固化在此文件，必须严格遵守）');
    const specBlock = /```\n([^\n]+)\n```/.exec(spec);
    expect(specBlock).not.toBeNull();
    const specString = specBlock[1];

    // 第二处：「Interpretation」段里反引号包着的键序串
    const interp = section(md, 'Interpretation（核心方法论）');
    const interpMatch = /`([^`]*case →[^`]*)`/.exec(interp);
    expect(interpMatch).not.toBeNull();
    const interpString = interpMatch[1];

    // 两串必须逐字相同
    expect(interpString).toBe(specString);
    // 且都必须等于约定的 13 键串
    expect(specString).toBe(KEY_ORDER);
    // 且都不得折行（折行会让两处对不上）
    expect(specString).not.toMatch(/\n/);
    expect(interpString).not.toMatch(/\n/);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd backend && npx jest tests/shiye-master.test.js
```

预期：FAIL，至少 3 条（「推进顺序」「不再说 10 个」「Execution 步序」）。

- [ ] **Step 4: 改写「输出规范」段**

在 `backend/skills/bazi-tuipan/shiye-master.skill.md` 里找到 `## 输出规范（固化在此文件，必须严格遵守）` 段，把其中的推进顺序代码块与硬性规则改为：

推进顺序代码块（原为 10 键，**一行**）改为：

````
```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi → boundaries → directions → playbooks → timeline → transition → summary
```
````

> **必须写成一行，不要折行。**
> Step 5 改的 Interpretation 那一行也是一行，且两处的键序串必须**逐字相同** ——
> 折行会让两处对不上，而「同一份键序在文件里出现两种排版」本身就是下次改契约时最容易漏读的地方。
> 这一行较长（159 字符）是可以接受的：原 seg2 那行本来就是一行 110 字符。

硬性规则第 2 条（原「顺序固定，10 个顶层键一个不少」）改为：

```
2. 顺序固定，13 个顶层键一个不少
```

- [ ] **Step 5: 改写「Interpretation」段里的键序那一行**

在 `## Interpretation（核心方法论）` 段里找到以 `**输出键序以 \`docs/CAREER_SCHEMA.md\` 为准**：` 开头的那一行
（seg2 原仓第 43 行），把它的键序串从 10 键改成 13 键：

改前：

```
**输出键序以 `docs/CAREER_SCHEMA.md` 为准**：`case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary`，
```

改后：

```
**输出键序以 `docs/CAREER_SCHEMA.md` 为准**：`case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi → boundaries → directions → playbooks → timeline → transition → summary`，
```

该行后半句「其中 `pattern` 在 `tiaoHou` 之前 —— 先定月令与格局底盘，再定气候与药。四层是**职责分工**，不是执行先后。」**逐字保留不动**。

- [ ] **Step 6: 改写「Execution」段**

把 `## Execution（执行步骤）` 段整段替换为：

````
## Execution（执行步骤）

按顺序执行下列步骤，每一步的结论填入括号内标注的契约键：

1. **接收命例**，整理性别与四柱 → 填 `case`（`gender`、`pillars.year/month/day/hour`）
2. **定月令开局**：月支、日主、季节气候、一句话定性 → 填 `monthCommand`
3. **定格局底盘**：月令提纲取格，判成格/破格/不清，指认财库等核心结构与成败理由 → 填 `pattern`
4. **定格局赛道**：按本命格局给出适合赛道与特质；若全局构成经典配格（财生官、官印相生、杀印相生、伤官制杀、食伤生财、财破印、用库成格），另给该配格的行业定向；不构成配格则 `byCombination` 留空 → 填 `patternTracks`
5. **定人生阶段**：综合格局、调候、喜忌，给出早年阶段特征与表现、中年后阶段特征与表现（这是综合判断，不是规则推导） → 填 `careerPhases`
6. **定调候与药**：判气机类型（寒局/燥热局/湿重局/燥硬局/春木旺局/秋金肃局），定主药次药，辨药的真/藏/假，指出还缺什么 → 填 `tiaoHou`
7. **定喜忌**：喜用五行、次喜五行、忌神五行 → 填 `xiJi`
8. **写忌神赛道边界**：每条给出行、为什么、有条件时怎么碰 → 填 `boundaries`（数组）
9. **定方位与行业**：按喜用五行给核心象、代表职业、性格适配、方位参考 → 填 `directions`（数组）
10. **分档打法**：早期借平台 / 轻创业 / 重资产操盘 / 合伙，各给适用条件与具体动作 → 填 `playbooks`（数组，`scale` 取「早期/轻创业/重资产/合伙」）
    —— **四档齐全**：某档在本命例确实不适用，也要保留该档并写明不适用及理由；
    `timeline[].playbook` 的取值**必须**是某个 `playbooks[].scale`
11. **排时间表**：每步大运的干支、五行类型、策略定性（重仓/轻试/守成）、主赛道、对应打法档位，并列出该运内的流年窗口（年份、信号、宜/忌） → 填 `timeline`（数组）
    —— **一步一条、逐条填**：每步大运各占一条记录；
    `ganZhi` 填**单步**大运的干支（如「癸亥」），「水运（亥、子）」是**五行分组**，逐步拆开、各填各的干支；
    `type` 取五行口径（水运/木运/火运/土运/金运），不是十神口径（财运、七杀运…）；
    `verdict` 落 `重仓` / `轻试` / `守成`，与 `suiyun-shiye` 的策略名对应：顺势重仓 → `重仓`、轻试待机 → `轻试`、守势收缩 → `守成`
12. **写交运过渡期**：换运前后一两年的风险与对策 → 填 `transition`
13. **写策略总纲**：整体走主业重仓 / 底盘待机 / 守成缓投，加若干条要点 → 填 `summary`

**产出校验**：输出前逐条核对 `docs/CAREER_SCHEMA.md` 的 13 个顶层键是否齐全、枚举值是否取自闭合集合。
````

- [ ] **Step 7: 跑测试确认通过**

```bash
cd backend && npx jest tests/shiye-master.test.js
```

预期：**8 个测试全绿**（推进顺序 / 不再说 10 个 / Execution 步序 / Execution 产出校验 / 三个新键 / Interpretation 键序 / Interpretation 其余内容 + Boundary / **两处键序串逐字相同且不折行**）。

> 最后一条守的是本任务**最核心的不变量**：前 7 条只验「13 个键名按顺序出现」，
> 但**两处键序串的排版是否一致它们验不出来** ——
> 一处折行一处不折行，7 条照样全绿，而模型运行期会同时看到两套键序。
> 第 8 条用正则把两串抠出来 **`toBe` 逐字比**，并断言都不得含 `\n`。
>
> **已实测**：把 Interpretation 那行折行后，这条断言**确实变红**（8 passed → 1 failed），
> 证明它真的在守，不是摆设。

- [ ] **Step 8: 写 `docs/SHIYE_MASTER_DIFF.md`**

内容必须逐字记录 6 处改写的前后对照：

````markdown
# shiye-master.skill.md 的改写记录

本仓的 `backend/skills/bazi-tuipan/shiye-master.skill.md` 是从
`zhouyi_seg2/skills/bazi-tuipan/shiye-master.skill.md` 拷贝后**改写了三段**。
**seg2 原仓一字未动。**

改写原因：本项目的契约是 **13 键**（seg2 是 10 键），
而 `shiye-master` 的「输出规范」「Interpretation」「Execution」三段把 10 键写死了。
原样注入会导致模型按 10 键输出，新增的 3 个键拿不到值，契约校验必然失败。
其中「Interpretation」段那处尤其关键：该段会被注入 system prompt，
不改模型就会在同一次请求里同时看到 10 键与 13 键两套键序。

## 1. 「输出规范」的推进顺序

改前：

```
case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary
```

改后：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

## 2. 「输出规范」硬性规则第 2 条

改前：`2. 顺序固定，10 个顶层键一个不少`
改后：`2. 顺序固定，13 个顶层键一个不少`

## 3. 「Interpretation」段里的键序那一行

改前：`case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary`
改后：`case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi → boundaries → directions → playbooks → timeline → transition → summary`

该行除键序串外逐字未动（含「`pattern` 在 `tiaoHou` 之前」与「四层是职责分工，不是执行先后」两句）。

## 4. 「Execution」插 3 步

改前：10 步（`case` → `monthCommand` → `pattern` → `tiaoHou` → `xiJi` → `boundaries`
→ `playbooks` → `timeline` → `transition` → `summary`）

改后：13 步，在 `pattern` 之后插 `patternTracks` 与 `careerPhases`，
在 `boundaries` 之后插 `directions`。完整改后文本见
`backend/skills/bazi-tuipan/shiye-master.skill.md` 的 `## Execution（执行步骤）` 段。

## 5. 「Execution」产出校验

改前：`逐条核对 docs/CAREER_SCHEMA.md 的 10 个顶层键是否齐全`
改后：`逐条核对 docs/CAREER_SCHEMA.md 的 13 个顶层键是否齐全`

## 6. 步号顺延

原 10 步的编号顺延为 13 步，总步数 10 → 13。

## 未改动的段

- `## Interpretation（核心方法论）` —— 除上面第 3 处那一行外逐字保留（纯方法论）
- `## 子 Skill 清单` —— 逐字保留
- `## A2（Future Trigger）` —— 逐字保留
- `## Boundary（边界）` —— 逐字保留（运行时本就不取，见设计规格 §5.2.1.1）
````

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat(skills): 落盘 5 个事业择业 skill，并把 master 三段改写为 13 键契约"
```

---

## Task 3: 13 键契约源 + 生成脚本 + 校验器

**Files:**
- Create: `docs/CAREER_SCHEMA.md`（唯一手写源）
- Create: `docs/CAREER_SCHEMA.sample.json`
- Create: `backend/scripts/build-career-schema.js`
- Create: `backend/scripts/validate-career-schema.js`
- Create: `backend/prompts/CAREER_SCHEMA.md`（生成物）
- Create: `backend/src/career/schema.js`
- Test: `backend/tests/career-schema.test.js`

**Interfaces:**
- Consumes: `docs/CAREER_SCHEMA.md`、`docs/CAREER_SCHEMA.sample.json`
- Produces:
  - `backend/src/career/schema.js` 导出：
    - `parseSchemaSource(markdownText)` → `{ topLevelKeys: string[], enums: Array<{path, values}>, machineSchema: object }`
    - `TOP_LEVEL_KEYS` → `string[]`（13 键，顺序即契约序）
    - `ENUMS` → `Array<{path: string, values: string[]}>`（8 组）
    - `MACHINE_SCHEMA` → 机读 JSON Schema 对象
  - `backend/scripts/build-career-schema.js` 导出 `buildSchemaMarkdown(sourceText)` → `string`，可直接 `node` 执行写文件
  - `backend/scripts/validate-career-schema.js` 导出 `validateGenerated(sourceText, generatedText)` → `string[]`（错误列表，空数组 = 一致）

- [ ] **Step 1: 写 `docs/CAREER_SCHEMA.md`**

先建目录（**新克隆的仓库里 `backend/prompts` 与 `backend/src/career` 不存在** ——
git 不跟踪空目录，Task 1 建的空目录没进提交）：

```bash
mkdir -p backend/prompts backend/src/career
```

这是**唯一手写源**。人读部分 + 机读 JSON Schema 块（用 ```` ```json ```` 包裹，解析器按这个标记提取）。

````markdown
# 事业推理 JSON 契约（CAREER_SCHEMA）

本项目阶段二（大模型出事业推理结果）的唯一输出格式。
**本文件是唯一手写源** —— `backend/prompts/CAREER_SCHEMA.md` 由
`npm run build:schema` 从本文件生成，**不要手改生成物**。

顶层 **13 个键**，顺序即输出顺序：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

其中 `pattern` 在 `tiaoHou` 之前：先定月令与格局底盘，再定气候与药。
`patternTracks` 在 `pattern` 之后（格局定了才知道赛道），
`careerPhases` 在 `patternTracks` 之后（综合判断，需先有格局与赛道），
`directions` 在 `boundaries` 之后（喜忌与忌神边界都定了才谈得上往哪发展）。

段落顺序对齐 `参考资料/事业推理结果.txt`（该文件是**骨架**，
其未覆盖的 `事业1/3/4` 知识由 `patternTracks` / `directions` 补齐）。

## 枚举速查（闭合集合，不得自造）

| 字段路径 | 取值 |
|---|---|
| `pattern.verdict` | `成格` / `破格` / `不清` |
| `tiaoHou.climateType` | `寒局` / `燥热局` / `湿重局` / `燥硬局` / `春木旺局` / `秋金肃局` |
| `tiaoHou.drugStatus` | `真药` / `藏药` / `假药` |
| `playbooks[].scale` | `早期` / `轻创业` / `重资产` / `合伙` |
| `timeline[].type` | `水运` / `木运` / `火运` / `土运` / `金运` |
| `timeline[].verdict` | `重仓` / `轻试` / `守成` |
| `timeline[].liunianWindows[].action` | `宜` / `忌` |
| `summary.strategy` | `主业重仓` / `底盘待机` / `守成缓投` |

> **`verdict` 在两处复用且枚举不同**：`pattern.verdict` 说的是格局成败（成格/破格/不清），
> `timeline[].verdict` 说的是该步大运的策略（重仓/轻试/守成）。两处不可混用。

## 字段语义

- `case` —— 命例基本盘：性别与四柱。
- `monthCommand` —— 月令（提纲）给出的开局：月支、日主、季节气候、一句话定性。
- `pattern` —— 格局底盘：格局类型、成格还是破格、财库等核心结构、成败理由。
  成败**一律按 `参考资料/事业2.txt:85-88` 重新判定**，不得照抄任何既有样例。
  「破格」说的是**不能重仓押这条线**，不等于「什么都不能做」——
  重仓 / 轻试 / 守成是岁运层对**赛道**的取舍（`timeline[].verdict`），两处不可互相推导。
- `patternTracks` —— **格局 → 赛道**（来自 `参考资料/事业2.txt`）。
  `byPattern` 给本命格局的适合赛道与特质，**必非空**；
  `byCombination` 给经典配格（财生官 / 官印相生 / 杀印相生 / 伤官制杀 /
  食伤生财 / 财破印 / 用库成格）的行业定向，**可为空**（不是所有命都构成经典配格）。
- `careerPhases` —— **人生阶段**（对齐 `参考资料/事业推理结果.txt:5`）。
  `early` 与 `later` 各一句：阶段特征 + 表现。
  ⚠️ 这是**综合判断**，不是规则推导 —— `事业1~4.txt` 里没有这一层的出处。
- `tiaoHou` —— 调候：全局气候类型、主药、次药、药的真假状态、判断理由、还缺什么。
  `primaryDrug` / `secondaryDrug` 是**调候层**的主药与次药，**必填**。
  ⚠️ `secondaryDrug` 取值以 `参考资料/事业推理结果.txt:7` 为准（该本命例为「丙火」），
  **不取** `参考资料/事业3.txt` 六大气机表的「柔金」口径。
  ⚠️ `xiJi.ciXi`（喜忌层次喜）与 `tiaoHou.secondaryDrug`（调候层次药）**分属两层，不得互相顶替**；
  本命例两层恰好都是丙火，那是巧合。
- `xiJi` —— 喜忌：喜用五行、次喜五行、忌神五行。
  `xi`（喜用）与 `ji`（忌神）**必非空**（忌神由喜用关系派生，即使该五行不在原局仍是忌）；
  `ciXi`（次喜）**允许为空数组** —— 它是**喜忌层的第三档加分项**，
  本命例若没有明显次喜就留空，**不得为凑满而编一个次喜**。
- `boundaries` —— **忌神赛道的边界**：某五行不是不能碰，而是缺了通关条件会怎样。每条三要素：五行、为什么、有条件时怎么碰。
- `directions` —— **方位与行业**（来自 `参考资料/事业1.txt`）。
  按**喜用五行**给：核心象、代表职业、性格适配、方位参考。**必非空**。
  忌神的方向不在这里表达 —— 由 `boundaries` 承担。
- `playbooks` —— **打法分档**：按体量分四档（早期借平台 / 轻创业 / 重资产操盘 / 合伙），每档给适用条件与具体动作。
  **四档齐全**：四档都要给出；某档在本命例确实不适用，也要保留该档并写明不适用及理由。
  `timeline[].playbook` 指向的档位**必须**是 `playbooks[].scale` 里的某一项。
- `timeline` —— 大运时间表：**每步大运一条**，干支、五行类型、策略定性、主赛道、对应打法档位，以及该运内的流年窗口。
  `ganZhi` 是**单步**大运的干支（如 `癸亥`）；资料里的「水运（亥、子）」是**五行分组**的口语说法，
  落到本字段时**逐步拆开、各填各的干支**。
  `liunianWindows` 至少一个 —— 机会类如「透出调候用神」，坑类如「刑冲格局根基」；
  哪怕一步大运全是坑年，也照样列出坑窗口。
- `transition` —— 交运过渡期：换运前后一两年的风险与对策。
- `summary` —— 策略总纲：整体走哪条路 + 若干条要点。

## 机读契约

```json
{
  "type": "object",
  "required": [
    "case", "monthCommand", "pattern", "patternTracks", "careerPhases", "tiaoHou",
    "xiJi", "boundaries", "directions", "playbooks", "timeline", "transition", "summary"
  ],
  "properties": {
    "case": {
      "type": "object",
      "required": ["gender", "pillars"],
      "properties": {
        "gender": { "type": "string" },
        "pillars": {
          "type": "object",
          "required": ["year", "month", "day", "hour"],
          "properties": {
            "year": { "type": "string" },
            "month": { "type": "string" },
            "day": { "type": "string" },
            "hour": { "type": "string" }
          }
        }
      }
    },
    "monthCommand": {
      "type": "object",
      "required": ["monthBranch", "dayMaster", "seasonClimate", "verdict"],
      "properties": {
        "monthBranch": { "type": "string" },
        "dayMaster": { "type": "string" },
        "seasonClimate": { "type": "string" },
        "verdict": { "type": "string" }
      }
    },
    "pattern": {
      "type": "object",
      "required": ["type", "verdict", "storeHouse", "reasoning"],
      "properties": {
        "type": { "type": "string" },
        "verdict": { "type": "string", "enum": ["成格", "破格", "不清"] },
        "storeHouse": { "type": "string" },
        "reasoning": { "type": "string" }
      }
    },
    "patternTracks": {
      "type": "object",
      "required": ["byPattern", "byCombination"],
      "properties": {
        "byPattern": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["pattern", "tracks", "trait", "note"],
            "properties": {
              "pattern": { "type": "string" },
              "tracks": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
              "trait": { "type": "string" },
              "note": { "type": "string" }
            }
          }
        },
        "byCombination": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "tracks", "condition"],
            "properties": {
              "name": { "type": "string" },
              "tracks": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
              "condition": { "type": "string" }
            }
          }
        }
      }
    },
    "careerPhases": {
      "type": "object",
      "required": ["early", "later"],
      "properties": {
        "early": { "type": "string", "minLength": 1 },
        "later": { "type": "string", "minLength": 1 }
      }
    },
    "tiaoHou": {
      "type": "object",
      "required": ["climateType", "primaryDrug", "secondaryDrug", "drugStatus", "drugReasoning", "gap"],
      "properties": {
        "climateType": { "type": "string", "enum": ["寒局", "燥热局", "湿重局", "燥硬局", "春木旺局", "秋金肃局"] },
        "primaryDrug": { "type": "string" },
        "secondaryDrug": { "type": "string" },
        "drugStatus": { "type": "string", "enum": ["真药", "藏药", "假药"] },
        "drugReasoning": { "type": "string" },
        "gap": { "type": "string" }
      }
    },
    "xiJi": {
      "type": "object",
      "required": ["xi", "ciXi", "ji"],
      "properties": {
        "xi": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "ciXi": { "type": "array", "items": { "type": "string" } },
        "ji": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
      }
    },
    "boundaries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["element", "why", "condition"],
        "properties": {
          "element": { "type": "string" },
          "why": { "type": "string" },
          "condition": { "type": "string" }
        }
      }
    },
    "directions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["element", "direction", "coreImage", "careers", "personality", "note"],
        "properties": {
          "element": { "type": "string" },
          "direction": { "type": "string" },
          "coreImage": { "type": "string" },
          "careers": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
          "personality": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    },
    "playbooks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["scale", "condition", "actions"],
        "properties": {
          "scale": { "type": "string", "enum": ["早期", "轻创业", "重资产", "合伙"] },
          "condition": { "type": "string" },
          "actions": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
        }
      }
    },
    "timeline": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["ganZhi", "type", "verdict", "mainTrack", "playbook", "liunianWindows"],
        "properties": {
          "ganZhi": { "type": "string" },
          "type": { "type": "string", "enum": ["水运", "木运", "火运", "土运", "金运"] },
          "verdict": { "type": "string", "enum": ["重仓", "轻试", "守成"] },
          "mainTrack": { "type": "string" },
          "playbook": { "type": "string" },
          "liunianWindows": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["year", "signal", "action"],
              "properties": {
                "year": { "type": "integer" },
                "signal": { "type": "string" },
                "action": { "type": "string", "enum": ["宜", "忌"] }
              }
            }
          }
        }
      }
    },
    "transition": {
      "type": "object",
      "required": ["risk", "advice"],
      "properties": {
        "risk": { "type": "string" },
        "advice": { "type": "string" }
      }
    },
    "summary": {
      "type": "object",
      "required": ["strategy", "notes"],
      "properties": {
        "strategy": { "type": "string", "enum": ["主业重仓", "底盘待机", "守成缓投"] },
        "notes": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
      }
    }
  }
}
```
````

- [ ] **Step 2: 写 `docs/CAREER_SCHEMA.sample.json`**

基准用例：戊辰 己未 乙亥 乙酉 男命。**13 键齐全**，内容取自 `参考资料/事业推理结果.txt` 与 `事业1~4.txt`：

```json
{
  "case": { "gender": "男", "pillars": { "year": "戊辰", "month": "己未", "day": "乙亥", "hour": "乙酉" } },
  "monthCommand": { "monthBranch": "未", "dayMaster": "乙木", "seasonClimate": "季夏燥土", "verdict": "财星当令，财多身难独担" },
  "pattern": { "type": "财格", "verdict": "破格", "storeHouse": "辰为水库，未为燥土财库，双库夹局", "reasoning": "财星被双乙比劫夺财（用神被克），且财多身难独担、财库厚而闭" },
  "patternTracks": {
    "byPattern": [
      { "pattern": "财格", "tracks": ["不动产长期持有", "连锁零售", "实体门店", "稳定现金流"], "trait": "适合细水长流，忌一把梭投机", "note": "本局财多身难独担，不能重仓押资产线" }
    ],
    "byCombination": [
      { "name": "用库成格（墓库做功）", "tracks": ["土地储备", "仓储", "收藏", "囤货"], "condition": "库能被冲开、库中做功神得用时成立" }
    ]
  },
  "careerPhases": {
    "early": "早年财杀混杂，多奔波、多试错、换赛道、平台辗转",
    "later": "中年后若大运引水印、中年以后家资成就"
  },
  "tiaoHou": { "climateType": "燥热局", "primaryDrug": "癸水", "secondaryDrug": "丙火", "drugStatus": "藏药", "drugReasoning": "亥藏壬水有润根，戊己厚土克水", "gap": "原局无丙透，缺阳光泄秀通关" },
  "xiJi": { "xi": ["水（印）", "木（比劫）"], "ciXi": ["丙火"], "ji": ["叠土", "叠金"] },
  "boundaries": [{ "element": "土金赛道", "why": "财重压身、杀重克身", "condition": "须有水木通关，方可轻碰" }],
  "directions": [
    { "element": "水", "direction": "北", "coreImage": "流动、变通、智慧", "careers": ["跨境贸易", "航运物流", "咨询策划", "市场调研"], "personality": "灵活、适应力强、懂变通", "note": "水润土清，是本局的调候活路" },
    { "element": "木", "direction": "东", "coreImage": "生发、成长、舒展", "careers": ["教育培训", "文化创意", "园艺花艺", "心理咨询"], "personality": "擅长学习、表达、共情、长期耕耘", "note": "木助身担财，帮藤萝扎根" }
  ],
  "playbooks": [
    { "scale": "早期", "condition": "财埋印、杀在后，宜借平台养印", "actions": ["优先平台与专业岗", "进大企业、规划院、设计或工程基建体系", "攒证书、人脉、报批确权套路"] },
    { "scale": "轻创业", "condition": "水印流通之年可以启动，门槛低、风险可控", "actions": ["咨询工作室", "独立方案团队", "技术顾问"] },
    { "scale": "重资产", "condition": "必须是「水印扶身、冲开财库、丙火通关」的大运流年窗口", "actions": ["厚积薄发，不是少年创业命", "等窗口期再开长线盘"] },
    { "scale": "合伙", "condition": "双乙比劫，有同气帮扶，但财库重、容易争利确权纠纷", "actions": ["先定规则", "锁产权", "留风控"] }
  ],
  "timeline": [{ "ganZhi": "癸亥", "type": "水运", "verdict": "重仓", "mainTrack": "深耕专业、铺底盘", "playbook": "早期", "liunianWindows": [{ "year": 2033, "signal": "透出调候用神", "action": "宜" }] }],
  "transition": { "risk": "藤萝根基未稳，见财心动、盲目重仓", "advice": "交运前后一两年不新开长线重资产盘" },
  "summary": { "strategy": "底盘待机", "notes": ["喜水木，忌叠土叠金"] }
}
```

- [ ] **Step 3: 写 `backend/src/career/schema.js`**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', '..', '..', 'docs', 'CAREER_SCHEMA.md');

/** 从 markdown 里抠出 ```json 包裹的机读契约块 */
function extractMachineSchema(text) {
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new Error('CAREER_SCHEMA.md 里找不到 ```json 机读契约块');
  return JSON.parse(m[1]);
}

/** 从人读的「枚举速查」表格里解析出闭合枚举 */
function extractEnums(text) {
  const table = /##\s*枚举速查[\s\S]*?\n\|[^\n]*\|\n\|[-|\s]*\|\n([\s\S]*?)\n\n/.exec(text);
  if (!table) throw new Error('CAREER_SCHEMA.md 里找不到「枚举速查」表格');
  const enums = [];
  for (const line of table[1].split('\n')) {
    // markdown 行首行尾的 `|` 会切出空串，所以路径在 cells[1]、取值在 cells[2]
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 4) continue;
    const fieldPath = cells[1].replace(/`/g, '');
    const values = cells[2]
      .split('/')
      .map((s) => s.trim().replace(/`/g, ''))
      .filter(Boolean);
    if (fieldPath && values.length) enums.push({ path: fieldPath, values });
  }
  return enums;
}

/**
 * 解析契约源。
 * @returns {{topLevelKeys: string[], enums: Array<{path,values}>, machineSchema: object}}
 */
function parseSchemaSource(markdownText) {
  const machineSchema = extractMachineSchema(markdownText);
  const topLevelKeys = machineSchema.required.slice();
  const enums = extractEnums(markdownText);
  return { topLevelKeys, enums, machineSchema };
}

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const parsed = parseSchemaSource(source);

const TOP_LEVEL_KEYS = parsed.topLevelKeys;
const ENUMS = parsed.enums;
const MACHINE_SCHEMA = parsed.machineSchema;

module.exports = { parseSchemaSource, TOP_LEVEL_KEYS, ENUMS, MACHINE_SCHEMA, SOURCE_PATH };
```

- [ ] **Step 4: 写 `backend/scripts/build-career-schema.js`**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSchemaSource } = require('../src/career/schema');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const TARGET_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');

/**
 * 从契约源生成注入 prompt 用的机读契约。
 * 只输出机读部分（JSON Schema），人读散文不进 prompt —— 散文太长且与 Schema 重复。
 */
function buildSchemaMarkdown(sourceText) {
  const { machineSchema, topLevelKeys } = parseSchemaSource(sourceText);
  const header = [
    '# 事业推理 JSON Schema（自动生成，勿手改）',
    '',
    '本文件由 `npm run build:schema` 从 `docs/CAREER_SCHEMA.md` 生成。',
    '改契约请改源文件，然后重新生成并跑 `npm run validate:schema`。',
    '',
    `顶层 ${topLevelKeys.length} 个键，顺序即输出顺序：`,
    '',
    '```',
    topLevelKeys.join(' → '),
    '```',
    '',
  ].join('\n');
  return header + '\n```json\n' + JSON.stringify(machineSchema, null, 2) + '\n```\n';
}

function main() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const output = buildSchemaMarkdown(sourceText);
  fs.writeFileSync(TARGET_PATH, output, 'utf8');
  console.log(`已生成 ${path.relative(ROOT, TARGET_PATH)}（${output.length} 字符）`);
}

if (require.main === module) main();

module.exports = { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH };
```

- [ ] **Step 5: 写 `backend/scripts/validate-career-schema.js`**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { buildSchemaMarkdown, SOURCE_PATH, TARGET_PATH } = require('./build-career-schema');

/**
 * 校验生成物与源一致。
 * @returns {string[]} 错误列表，空数组表示一致
 */
function validateGenerated(sourceText, generatedText) {
  const errors = [];
  const expected = buildSchemaMarkdown(sourceText);
  if (expected !== generatedText) {
    errors.push(
      `backend/prompts/CAREER_SCHEMA.md 与 docs/CAREER_SCHEMA.md 不同步：` +
      `请运行 npm run build:schema 重新生成（期望 ${expected.length} 字符，实际 ${generatedText.length} 字符）`,
    );
  }
  return errors;
}

function main() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const generatedText = fs.readFileSync(TARGET_PATH, 'utf8');
  const errors = validateGenerated(sourceText, generatedText);
  if (errors.length) {
    for (const e of errors) console.error('✗ ' + e);
    process.exit(1);
  }
  console.log('✓ 契约生成物与源一致');
}

if (require.main === module) main();

module.exports = { validateGenerated };
```

- [ ] **Step 6: 生成并跑测试**

先执行生成：

```bash
cd backend && npm run build:schema
```

预期输出：`已生成 prompts\CAREER_SCHEMA.md（NNNN 字符）`。

再写 `backend/tests/career-schema.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSchemaSource, TOP_LEVEL_KEYS, ENUMS, MACHINE_SCHEMA } = require('../src/career/schema');
const { validateGenerated } = require('../scripts/validate-career-schema');
const { buildSchemaMarkdown } = require('../scripts/build-career-schema');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'docs', 'CAREER_SCHEMA.md');
const GENERATED_PATH = path.join(__dirname, '..', 'prompts', 'CAREER_SCHEMA.md');

const EXPECTED_KEYS = [
  'case', 'monthCommand', 'pattern', 'patternTracks', 'careerPhases', 'tiaoHou',
  'xiJi', 'boundaries', 'directions', 'playbooks', 'timeline', 'transition', 'summary',
];

describe('事业推理契约', () => {
  test('顶层是 13 个键，且顺序与契约序一致', () => {
    expect(TOP_LEVEL_KEYS).toEqual(EXPECTED_KEYS);
  });

  test('枚举是 8 组，取值与速查表一致', () => {
    expect(ENUMS).toHaveLength(8);
    const byPath = {};
    for (const e of ENUMS) byPath[e.path] = e.values;
    expect(byPath['pattern.verdict']).toEqual(['成格', '破格', '不清']);
    expect(byPath['tiaoHou.climateType']).toEqual(['寒局', '燥热局', '湿重局', '燥硬局', '春木旺局', '秋金肃局']);
    expect(byPath['tiaoHou.drugStatus']).toEqual(['真药', '藏药', '假药']);
    expect(byPath['playbooks[].scale']).toEqual(['早期', '轻创业', '重资产', '合伙']);
    expect(byPath['timeline[].type']).toEqual(['水运', '木运', '火运', '土运', '金运']);
    expect(byPath['timeline[].verdict']).toEqual(['重仓', '轻试', '守成']);
    expect(byPath['timeline[].liunianWindows[].action']).toEqual(['宜', '忌']);
    expect(byPath['summary.strategy']).toEqual(['主业重仓', '底盘待机', '守成缓投']);
  });

  test('机读契约的 required 与顶层键序完全一致', () => {
    expect(MACHINE_SCHEMA.required).toEqual(EXPECTED_KEYS);
    expect(Object.keys(MACHINE_SCHEMA.properties)).toEqual(EXPECTED_KEYS);
  });

  test('必非空数组都声明了 minItems >= 1', () => {
    const p = MACHINE_SCHEMA.properties;
    expect(p.xiJi.properties.xi.minItems).toBe(1);
    expect(p.xiJi.properties.ji.minItems).toBe(1);
    expect(p.boundaries.minItems).toBe(1);
    expect(p.playbooks.minItems).toBe(1);
    expect(p.playbooks.items.properties.actions.minItems).toBe(1);
    expect(p.timeline.minItems).toBe(1);
    expect(p.timeline.items.properties.liunianWindows.minItems).toBe(1);
    expect(p.summary.properties.notes.minItems).toBe(1);
    expect(p.patternTracks.properties.byPattern.minItems).toBe(1);
    expect(p.directions.minItems).toBe(1);
  });

  test('ciXi 可空、byCombination 可空，且都未声明 minItems', () => {
    const p = MACHINE_SCHEMA.properties;
    expect(p.xiJi.properties.ciXi.minItems).toBeUndefined();
    expect(p.patternTracks.properties.byCombination.minItems).toBeUndefined();
  });

  test('careerPhases 的 early/later 都要求非空串', () => {
    const cp = MACHINE_SCHEMA.properties.careerPhases.properties;
    expect(cp.early.minLength).toBe(1);
    expect(cp.later.minLength).toBe(1);
  });

  test('生成物与源同步', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generatedText = fs.readFileSync(GENERATED_PATH, 'utf8');
    expect(validateGenerated(sourceText, generatedText)).toEqual([]);
  });

  test('源文件被改动而未重新生成时，校验要报错', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generatedText = fs.readFileSync(GENERATED_PATH, 'utf8');
    // 改动必须落在**会被生成物反映出来**的地方 —— 机读契约块的 required 列表。
    // （在源文件末尾追加一句「改动」是不行的：buildSchemaMarkdown 只提取
    //   ```json 块与枚举表，末尾多一行不影响生成物，校验就查不出不同步。）
    const tampered = sourceText.replace(
      '"case", "monthCommand"',
      '"case", "monthCommand", "tampered"',
    );
    expect(tampered).not.toBe(sourceText);   // 确认替换真的发生了
    expect(validateGenerated(tampered, generatedText)).toHaveLength(1);
  });

  test('parseSchemaSource 从 markdown 里能抠出机读块与枚举', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const parsed = parseSchemaSource(sourceText);
    expect(parsed.topLevelKeys).toEqual(EXPECTED_KEYS);
    expect(parsed.enums).toHaveLength(8);
    expect(parsed.machineSchema.type).toBe('object');
  });

  test('buildSchemaMarkdown 的输出含 13 键的键序声明', () => {
    const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
    const out = buildSchemaMarkdown(sourceText);
    expect(out).toContain('顶层 13 个键');
    for (const key of EXPECTED_KEYS) expect(out).toContain(key);
  });
});
```

跑测试：

```bash
cd backend && npx jest tests/career-schema.test.js
```

预期：**10 个测试全绿**。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(career): 立 13 键契约源 + 生成脚本 + 契约常量解析"
```

---

## Task 4: 契约校验器（运行时）

**Files:**
- Create: `backend/src/career/validate.js`
- Test: `backend/tests/career-validate.test.js`

**Interfaces:**
- Consumes: `backend/src/career/schema.js` 的 `MACHINE_SCHEMA`、`TOP_LEVEL_KEYS`
- Produces:
  - `validateCareer(data)` → `{ ok: boolean, defects: string[] }`
  - `careerDefects(data)` → `string[]`
  - 缺陷格式：`顶层键` / `顶层键.嵌套键` / `顶层键.嵌套键[下标]`

- [ ] **Step 1: 写失败的测试**

`backend/tests/career-validate.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { validateCareer, careerDefects } = require('../src/career/validate');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

/** 深拷贝，避免改动污染原对象 */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

describe('事业推理结果的契约校验', () => {
  test('基准样例通过校验', () => {
    const r = validateCareer(clone(SAMPLE));
    expect(r.ok).toBe(true);
    expect(r.defects).toEqual([]);
  });

  test('缺少顶层键要报错，并指出缺哪个', () => {
    const d = clone(SAMPLE);
    delete d.directions;
    const defects = careerDefects(d);
    expect(defects.join()).toContain('directions');
  });

  test('顶层键的顺序不对要报错', () => {
    const d = clone(SAMPLE);
    // 把 patternTracks 挪到末尾
    const v = d.patternTracks;
    delete d.patternTracks;
    d.patternTracks = v;
    const defects = careerDefects(d);
    expect(defects.join()).toContain('键序');
  });

  test('枚举取值非法要报错', () => {
    const d = clone(SAMPLE);
    d.pattern.verdict = '大吉';
    const defects = careerDefects(d);
    expect(defects.join()).toContain('pattern.verdict');
  });

  test('两处 verdict 混用要报错（格局成败写成策略值）', () => {
    const d = clone(SAMPLE);
    d.pattern.verdict = '重仓';
    const defects = careerDefects(d);
    expect(defects.join()).toContain('pattern.verdict');
  });

  test('timeline 的 verdict 用格局成败值要报错', () => {
    const d = clone(SAMPLE);
    d.timeline[0].verdict = '破格';
    const defects = careerDefects(d);
    expect(defects.join()).toContain('timeline[0].verdict');
  });

  test('必非空数组为空要报错', () => {
    const d = clone(SAMPLE);
    d.xiJi.ji = [];
    expect(careerDefects(d).join()).toContain('xiJi.ji');
    const d2 = clone(SAMPLE);
    d2.patternTracks.byPattern = [];
    expect(careerDefects(d2).join()).toContain('byPattern');
    const d3 = clone(SAMPLE);
    d3.directions = [];
    expect(careerDefects(d3).join()).toContain('directions');
  });

  test('ciXi 为空是合法的', () => {
    const d = clone(SAMPLE);
    d.xiJi.ciXi = [];
    expect(careerDefects(d)).toEqual([]);
  });

  test('byCombination 为空是合法的', () => {
    const d = clone(SAMPLE);
    d.patternTracks.byCombination = [];
    expect(careerDefects(d)).toEqual([]);
  });

  test('careerPhases 的 early 为空串要报错', () => {
    const d = clone(SAMPLE);
    d.careerPhases.early = '';
    expect(careerDefects(d).join()).toContain('careerPhases.early');
  });

  test('playbooks 四档不齐全要报错', () => {
    const d = clone(SAMPLE);
    d.playbooks = d.playbooks.slice(0, 2);
    expect(careerDefects(d).join()).toContain('playbooks');
  });

  test('timeline[].playbook 必须指向某个 playbooks[].scale', () => {
    const d = clone(SAMPLE);
    d.timeline[0].playbook = '不存在的档位';
    expect(careerDefects(d).join()).toContain('playbook');
  });

  test('数组项的内部结构错要报到下标', () => {
    const d = clone(SAMPLE);
    delete d.timeline[0].liunianWindows[0].action;
    expect(careerDefects(d).join()).toContain('timeline[0].liunianWindows[0]');
  });

  test('不是对象要报错', () => {
    expect(validateCareer(null).ok).toBe(false);
    expect(validateCareer('字符串').ok).toBe(false);
    expect(validateCareer([]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx jest tests/career-validate.test.js
```

预期：FAIL，报 `Cannot find module '../src/career/validate'`。

- [ ] **Step 3: 写实现**

`backend/src/career/validate.js`：

```javascript
'use strict';

const { MACHINE_SCHEMA, TOP_LEVEL_KEYS } = require('./schema');

/** 取一个值的类型名 */
function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * 递归校验一个值是否符合 schema。
 * 支持：object / array / string / integer / number / enum / required / minItems / minLength。
 * 错误以 `path: 说明` 的形式 push 进 defects。
 */
function checkValue(value, schema, path, defects) {
  if (!schema) return;

  if (schema.enum && !schema.enum.includes(value)) {
    defects.push(`${path}: 值 "${value}" 不在枚举 [${schema.enum.join(' / ')}] 内`);
    return;
  }

  switch (schema.type) {
    case 'object': {
      if (typeName(value) !== 'object') {
        defects.push(`${path}: 期望 object，实际 ${typeName(value)}`);
        return;
      }
      for (const key of schema.required || []) {
        if (!(key in value)) defects.push(`${path}.${key}: 必填字段缺失`);
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) checkValue(value[key], sub, `${path}.${key}`, defects);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        defects.push(`${path}: 期望 array，实际 ${typeName(value)}`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        defects.push(`${path}: 至少需要 ${schema.minItems} 项，实际 ${value.length} 项`);
      }
      if (schema.items) {
        value.forEach((item, i) => checkValue(item, schema.items, `${path}[${i}]`, defects));
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        defects.push(`${path}: 期望 string，实际 ${typeName(value)}`);
        return;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        defects.push(`${path}: 不得为空串`);
      }
      return;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        defects.push(`${path}: 期望 integer，实际 ${JSON.stringify(value)}`);
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number') {
        defects.push(`${path}: 期望 number，实际 ${typeName(value)}`);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * 校验事业推理结果。
 * @returns {string[]} 缺陷列表，空数组表示通过
 */
function careerDefects(data) {
  const defects = [];

  if (typeName(data) !== 'object') {
    defects.push(`整体: 期望 object，实际 ${typeName(data)}`);
    return defects;
  }

  // 键集：多一个少一个都要报
  const actual = Object.keys(data);
  for (const key of TOP_LEVEL_KEYS) {
    if (!actual.includes(key)) defects.push(`${key}: 顶层键缺失`);
  }
  for (const key of actual) {
    if (!TOP_LEVEL_KEYS.includes(key)) defects.push(`${key}: 顶层键不在契约里`);
  }

  // 键序：契约序之外的键忽略，只比共同的键的先后
  const common = actual.filter((k) => TOP_LEVEL_KEYS.includes(k));
  const expectedCommon = TOP_LEVEL_KEYS.filter((k) => common.includes(k));
  if (common.join(',') !== expectedCommon.join(',')) {
    defects.push(`键序: 顶层键顺序应为 ${TOP_LEVEL_KEYS.join(' → ')}，实际 ${common.join(' → ')}`);
  }

  // 结构与取值
  checkValue(data, MACHINE_SCHEMA, '事业推理结果', defects);

  // 打法四档齐全
  if (Array.isArray(data.playbooks)) {
    const scales = new Set(data.playbooks.map((p) => p && p.scale));
    for (const need of ['早期', '轻创业', '重资产', '合伙']) {
      if (!scales.has(need)) defects.push(`playbooks: 缺「${need}」这一档，四档必须齐全`);
    }
  }

  // timeline[].playbook 必须指向某个 playbooks[].scale
  if (Array.isArray(data.playbooks) && Array.isArray(data.timeline)) {
    const scales = new Set(data.playbooks.map((p) => p && p.scale));
    data.timeline.forEach((step, i) => {
      if (!step || typeof step !== 'object') return;
      if (typeof step.playbook === 'string' && !scales.has(step.playbook)) {
        defects.push(`timeline[${i}].playbook: 取值 "${step.playbook}" 不是任何一个 playbooks[].scale`);
      }
    });
  }

  return defects;
}

/**
 * @returns {{ok: boolean, defects: string[]}}
 */
function validateCareer(data) {
  const defects = careerDefects(data);
  return { ok: defects.length === 0, defects };
}

module.exports = { validateCareer, careerDefects, checkValue, typeName };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx jest tests/career-validate.test.js
```

预期：**14 个测试全绿**。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(career): 实现 13 键契约的运行时校验器"
```

---

## Task 5: 渲染器 —— JSON → 散文文档

**Files:**
- Create: `backend/src/career/render.js`
- Test: `backend/tests/career-render.test.js`

**Interfaces:**
- Consumes: 符合契约的 JSON
- Produces:
  - `renderCareerProse(data)` → `string`（Markdown 散文）
  - `groupTimelineByType(timeline)` → `Array<{type, steps, branches}>`
  - `BRANCHES_BY_TYPE` → `Record<string, string>`（`{水运: '亥、子', 木运: '寅、卯', 火运: '巳、午', 土运: '辰、戌、丑、未', 金运: '申、酉'}`）

- [ ] **Step 1: 写失败的测试**

`backend/tests/career-render.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { renderCareerProse, groupTimelineByType, BRANCHES_BY_TYPE } = require('../src/career/render');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

function clone(o) { return JSON.parse(JSON.stringify(o)); }

describe('事业推理结果渲染成散文', () => {
  test('输出的段落顺序与契约键序一致', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    // 锚点用**实际渲染出来的小标题**（render.js 的 SECTION_TITLES 拼出来的原文）。
    // 注意：喜忌是一段（标题「## 喜忌」），月令与格局合并成一段（标题「## 月令与格局」）。
    const anchors = [
      '## 八字命例', '## 月令与格局', '## 格局赛道', '## 事业阶段', '## 调候',
      '## 喜忌', '## 边界', '## 方位与行业', '## 打法', '## 大运',
      '## 交运', '## 策略总纲',
    ];
    let cursor = -1;
    for (const a of anchors) {
      const at = prose.indexOf(a, cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test('喜忌段里喜、次喜、忌三项都渲染出来了', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('喜：水（印）、木（比劫）');
    expect(prose).toContain('次喜：丙火');
    expect(prose).toContain('忌：叠土、叠金');
  });

  test('没有 JSON 键名残留在散文里', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    for (const key of ['monthCommand', 'patternTracks', 'careerPhases', 'liunianWindows', 'mainTrack']) {
      expect(prose).not.toContain(key);
    }
  });

  test('四柱出现在开头', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('戊辰');
    expect(prose).toContain('己未');
    expect(prose).toContain('乙亥');
    expect(prose).toContain('乙酉');
  });

  test('月令与格局合并成一段', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('财星当令，财多身难独担');
    expect(prose).toContain('辰为水库，未为燥土财库，双库夹局');
  });

  test('事业阶段段照抄 early 与 later', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('早年财杀混杂，多奔波、多试错、换赛道、平台辗转');
    expect(prose).toContain('中年后若大运引水印、中年以后家资成就');
  });

  test('打法四档都出现', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    for (const s of ['早期', '轻创业', '重资产', '合伙']) {
      expect(prose).toContain(s);
    }
  });

  test('大运按五行类型分组，括注地支集', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('水运（亥、子）');
  });

  test('流年窗口也渲染出来（散文比 txt 多出的内容）', () => {
    const prose = renderCareerProse(clone(SAMPLE));
    expect(prose).toContain('2033');
    expect(prose).toContain('透出调候用神');
  });

  test('BRANCHES_BY_TYPE 覆盖 5 种运', () => {
    expect(Object.keys(BRANCHES_BY_TYPE).sort()).toEqual(['土运', '水运', '木运', '火运', '金运'].sort());
    expect(BRANCHES_BY_TYPE['水运']).toBe('亥、子');
    expect(BRANCHES_BY_TYPE['金运']).toBe('申、酉');
  });

  test('groupTimelineByType 把同类型的相邻大运归到一组', () => {
    const groups = groupTimelineByType([
      { ganZhi: '癸亥', type: '水运' },
      { ganZhi: '甲子', type: '水运' },
      { ganZhi: '乙丑', type: '土运' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('水运');
    expect(groups[0].steps).toHaveLength(2);
    expect(groups[1].type).toBe('土运');
  });

  test('相邻不同类型的分开成组', () => {
    const groups = groupTimelineByType([
      { ganZhi: '癸亥', type: '水运' },
      { ganZhi: '乙丑', type: '土运' },
      { ganZhi: '丙寅', type: '木运' },
    ]);
    expect(groups.map((g) => g.type)).toEqual(['水运', '土运', '木运']);
  });

  test('空 timeline 不炸', () => {
    const d = clone(SAMPLE);
    d.timeline = [];
    expect(() => renderCareerProse(d)).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx jest tests/career-render.test.js
```

预期：FAIL，报 `Cannot find module '../src/career/render'`。

- [ ] **Step 3: 写实现**

`backend/src/career/render.js`：

```javascript
'use strict';

/** 五行运 → 该运常见地支（渲染时括注用） */
const BRANCHES_BY_TYPE = {
  '水运': '亥、子',
  '木运': '寅、卯',
  '火运': '巳、午',
  '土运': '辰、戌、丑、未',
  '金运': '申、酉',
};

/** 契约键 → 散文小标题（顺序即输出顺序） */
const SECTION_TITLES = {
  case: '八字命例',
  monthCommand: '月令',
  pattern: '格局',
  patternTracks: '格局赛道',
  careerPhases: '事业阶段',
  tiaoHou: '调候',
  xiJi: '喜忌',
  boundaries: '边界',
  directions: '方位与行业',
  playbooks: '打法',
  timeline: '大运',
  transition: '交运',
  summary: '策略总纲',
};

/**
 * 把 timeline 按相邻同五行类型归组。
 * @param {Array<{type: string}>} timeline
 * @returns {Array<{type: string, steps: Array<object>}>}
 */
function groupTimelineByType(timeline) {
  const groups = [];
  for (const step of timeline || []) {
    if (!step || typeof step !== 'object') continue;
    const last = groups[groups.length - 1];
    if (last && last.type === step.type) {
      last.steps.push(step);
    } else {
      groups.push({ type: step.type, steps: [step] });
    }
  }
  return groups;
}

/** 列表拼成中文顿号句 */
function joinList(items) {
  return (items || []).join('、');
}

/**
 * 把符合契约的事业推理 JSON 渲染成散文文档。
 * 段落顺序与契约键序一致；月令与格局合并成一段（对齐《事业推理结果.txt》的 L4）。
 */
function renderCareerProse(data) {
  const out = [];
  const p = (text) => out.push(text);

  // 1. 命例
  const c = data.case || {};
  const pillars = c.pillars || {};
  p(`## ${SECTION_TITLES.case}`);
  p(`${c.gender || ''}命，${pillars.year || ''}年 ${pillars.month || ''}月 ${pillars.day || ''}日 ${pillars.hour || ''}时。`);
  p('');

  // 2. 月令 + 格局（合并成一段）
  const mc = data.monthCommand || {};
  const pt = data.pattern || {};
  p(`## ${SECTION_TITLES.monthCommand}与${SECTION_TITLES.pattern}`);
  p(`月令${mc.monthBranch || ''}，${mc.seasonClimate || ''}；${mc.verdict || ''}。`
    + `格局为${pt.type || ''}，${pt.verdict || ''}；${pt.storeHouse || ''}；${pt.reasoning || ''}。`);
  p('');

  // 3. 格局赛道
  const ptr = data.patternTracks || {};
  p(`## ${SECTION_TITLES.patternTracks}`);
  for (const row of ptr.byPattern || []) {
    if (!row) continue;
    p(`${row.pattern || ''}：${joinList(row.tracks)}；${row.trait || ''}${row.note ? '（' + row.note + '）' : ''}。`);
  }
  for (const row of ptr.byCombination || []) {
    if (!row) continue;
    p(`${row.name || ''}：${joinList(row.tracks)}${row.condition ? '（条件：' + row.condition + '）' : ''}。`);
  }
  p('');

  // 4. 事业阶段
  const cp = data.careerPhases || {};
  p(`## ${SECTION_TITLES.careerPhases}`);
  p(`早年：${cp.early || ''}；中年后：${cp.later || ''}。`);
  p('');

  // 5. 调候
  const th = data.tiaoHou || {};
  p(`## ${SECTION_TITLES.tiaoHou}`);
  p(`${th.climateType || ''}，调候第一要 ${th.primaryDrug || ''}，次要 ${th.secondaryDrug || ''}；`
    + `药为${th.drugStatus || ''}：${th.drugReasoning || ''}；${th.gap || ''}。`);
  p('');

  // 6. 喜忌
  const xj = data.xiJi || {};
  p(`## ${SECTION_TITLES.xiJi}`);
  p(`喜：${joinList(xj.xi)}；`);
  if ((xj.ciXi || []).length) p(`次喜：${joinList(xj.ciXi)}；`);
  p(`忌：${joinList(xj.ji)}。`);
  p('');

  // 7. 边界
  p(`## ${SECTION_TITLES.boundaries}`);
  for (const row of data.boundaries || []) {
    if (!row) continue;
    p(`不是不能碰${row.element || ''}：${row.why || ''}；${row.condition || ''}。`);
  }
  p('');

  // 8. 方位与行业
  p(`## ${SECTION_TITLES.directions}`);
  for (const row of data.directions || []) {
    if (!row) continue;
    p(`${row.element || ''}（${row.direction || ''}）：${row.coreImage || ''}；`
      + `代表职业 ${joinList(row.careers)}；${row.personality || ''}${row.note ? '（' + row.note + '）' : ''}。`);
  }
  p('');

  // 9. 打法
  p(`## ${SECTION_TITLES.playbooks}`);
  for (const row of data.playbooks || []) {
    if (!row) continue;
    p(`${row.scale || ''}：${row.condition || ''}；${joinList(row.actions)}。`);
  }
  p('');

  // 10. 大运
  p(`## ${SECTION_TITLES.timeline}`);
  for (const group of groupTimelineByType(data.timeline)) {
    const branches = BRANCHES_BY_TYPE[group.type];
    const head = branches ? `${group.type}（${branches}）` : group.type;
    const stepText = group.steps
      .map((s) => `${s.ganZhi || ''}（${s.verdict || ''}，${s.mainTrack || ''}${s.playbook ? '，走' + s.playbook + '档' : ''}）`)
      .join('；');
    p(`${head}：${stepText}。`);
    for (const s of group.steps) {
      for (const w of s.liunianWindows || []) {
        if (!w) continue;
        p(`  - ${w.year}年 ${w.signal || ''}（${w.action || ''}）`);
      }
    }
  }
  p('');

  // 11. 交运
  const tr = data.transition || {};
  p(`## ${SECTION_TITLES.transition}`);
  p(`${tr.risk || ''}；${tr.advice || ''}。`);
  p('');

  // 12. 策略总纲
  const sm = data.summary || {};
  p(`## ${SECTION_TITLES.summary}`);
  p(`${sm.strategy || ''}；${joinList(sm.notes)}。`);

  return out.join('\n');
}

module.exports = { renderCareerProse, groupTimelineByType, BRANCHES_BY_TYPE, SECTION_TITLES };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx jest tests/career-render.test.js
```

预期：**13 个测试全绿**（段落顺序 / 喜忌三项 / 无 JSON 键名 / 四柱开头 / 月令格局合并 / 事业阶段 / 打法四档 / 大运分组 / 流年窗口 / BRANCHES 五种 / 相邻同型归组 / 相邻异型分开 / 空 timeline 不炸）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(career): 实现 JSON → 散文文档的渲染器"
```

---

## Task 6: `prompt.js` —— 多段 skill 提取器 + 两套 prompt 组装

**Files:**
- Create: `backend/src/llm/prompt.js`（重写）
- Create: `backend/src/llm/client.js`（从 v2 拷贝后删解读层部分）
- Create: `backend/prompts/CAREER_PROMPT.md`
- Test: `backend/tests/llm-prompt.test.js`

**Interfaces:**
- Consumes: `backend/skills/bazi-tuipan/`、v2 拷贝来的 `client.js`
- Produces:
  - `extractSection(markdown, heading)` → `string`（`## <heading>` 到下一个 `## `）
  - `extractInterpretation(markdown)` → `string`（`## Interpretation（核心方法论）` 段）
  - `buildCareerSystemPrompt()` → `string`（阶段二用）
  - `buildCareerUserPrompt(chart)` → `string`（阶段二用）
  - `buildChatSystemPrompt(careerJson, careerProse)` → `string`（阶段三用）
  - `buildChatUserPrompt(history, message)` → `string`（阶段三用）
  - `client.js` 导出：`callMiniMax(messages)`、`parseLLMJson(raw)`、`friendlyError(err)`

- [ ] **Step 1: 从 v2 拷贝 `client.js` 并删解读层部分**

```bash
mkdir -p backend/src/llm
cp ../zhouyi_seg1_v2/backend/src/llm/client.js backend/src/llm/client.js
```

> **`mkdir -p backend/src/llm` 不能省。** Task 1 建了这个目录，但 **git 不跟踪空目录** ——
> 提交里没有它，**新克隆一份仓库时该目录不存在**，`cp` 会报
> `cp: cannot create regular file 'backend/src/llm/client.js': No such file or directory`
> （退出码 1，后面跟着的 `&&` 一串都不执行）。
> 同理，`backend/src/career`（Task 3/4/5）与 `backend/prompts`（Task 3）在新克隆时也不存在 ——
> Task 3 的 Step 1/3/4 也要各自 `mkdir -p`。

然后**删掉**解读层专有的部分，保留 `callMiniMax` / `parseLLMJson` / `friendlyError` / 括号容错解析（`repairBraces` / `extractSections` / `findStringEnd` / `matchBracket`）。

删掉的内容（逐字定位后整块删除）：
- 常量 `REQUIRED_INTERPRET_KEYS`（`client.js:253-256`）
- 常量 `REQUIRED_INTERPRET_FIELDS`（`client.js:262-273`）
- 常量 `OPAQUE_INTERPRET_FIELDS`（`client.js:276-278`）
- 常量 `INTERPRET_ARRAY_SPECS`（`client.js:284-292`）
- 函数 `interpretDefects(data)`（`client.js:300-364`）
- 函数 `validateInterpret(data)`（`client.js:371-373`）
- 对应的 `module.exports` 条目

改后的 `module.exports` 应该是：

```javascript
module.exports = { callMiniMax, parseLLMJson, friendlyError };
```

> 删除后跑一次 `node -e "require('./backend/src/llm/client.js')"` 确认没有语法错误、没有引用已删函数。

- [ ] **Step 2: 写 `backend/prompts/CAREER_PROMPT.md`**

这是注入阶段二 system prompt 的**合同**部分（行为约束 + 字段指引），人读散文不进 prompt（太长且与 Schema 重复）。

````markdown
# 事业推理合同

你是八字推盘的事业择业顾问。程序已经离线算出了命盘 JSON —— 四柱、藏干、十神、
纳音、十二长生、神煞、干支作用、旺衰打分、格局候选、大运流年**都已算好，请直接采用，
不要重新计算，也不要重排四柱**。

## 你的任务

基于命盘 JSON 与下面的「事业择业知识库」，产出一份**结构化的事业推理结果**，
严格符合 system 提示词末尾的 JSON Schema。

## 四层叠加的决策链

| 层 | 回答什么 | 由哪个 skill 提供 |
|---|---|---|
| 调候 | 全局什么气候？急药是谁？药真不真？ | `tiaohou-shiye` |
| 格局 | 底盘是哪一格？成格 / 破格 / 不清？ | `geshi-shiye` |
| 五行 | 载体落在哪块实体赛道？往哪发展？ | `wuxing-shiye` |
| 岁运 | 何时重仓、何时轻试、何时守成？ | `suiyun-shiye` |

四层是**职责分工**，不是四选一：调候定的药会改变格局的成败判断；格局定的底盘决定
五行载体能不能出功；岁运引动哪一层，就在那层上兑现。

## 输出顺序（不可调换）

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

## 字段填写指引

- `case` —— 性别与四柱，**逐字照抄命盘 JSON 的 `pillars`**，不许改。
- `monthCommand` —— 月支、日主、季节气候、一句话定性（月令给出的开局）。
- `pattern` —— 格局类型、成格还是破格、财库等核心结构、成败理由。
  成败**一律按 `参考资料/事业2.txt` 的「成格 / 破格 / 不清」三条判据重新判定**，
  不许照抄任何既有样例。「破格」说的是**不能重仓押这条线**，不等于「什么都不能做」。
- `patternTracks` —— 按本命格局给适合赛道与特质（`byPattern` 必填）；
  若全局构成经典配格（财生官 / 官印相生 / 杀印相生 / 伤官制杀 / 食伤生财 /
  财破印 / 用库成格），另给该配格的行业定向（`byCombination`）；不构成则留空数组。
- `careerPhases` —— 早年阶段特征与表现、中年后阶段特征与表现。
  这是**综合判断**（综合格局、调候、喜忌），不是规则推导。
- `tiaoHou` —— 全局气候类型、主药、次药、药的真/藏/假、判断理由、还缺什么。
  **调候层不产忌神** —— 忌神统一落 `xiJi.ji`。
  `primaryDrug` / `secondaryDrug` 是**调候层**的主药与次药。
- `xiJi` —— 喜用五行（必非空）、次喜五行（**可为空，不得为凑满而编一个次喜**）、忌神五行（必非空）。
- `boundaries` —— 忌神赛道的边界，每条三要素：五行、为什么、有条件时怎么碰。
  写法是「不是不能碰 X：……；……」，不是「绝对不能碰」。
- `directions` —— 按**喜用五行**给核心象、代表职业、性格适配、方位参考。
  忌神的方向不在这里表达 —— 由 `boundaries` 承担。
- `playbooks` —— 四档打法：早期 / 轻创业 / 重资产 / 合伙。
  **四档齐全**：某档确实不适用也要保留该档并写明不适用及理由。
- `timeline` —— **每步大运一条**（不是五行一组）：干支、五行类型、策略定性、
  主赛道、对应打法档位、该运内的流年窗口。
  `ganZhi` 填**单步**干支；「水运（亥、子）」是口语分组，**逐步拆开、各填各的干支**。
  `type` 用**五行口径**（水运/木运/火运/土运/金运），不是十神口径。
  `verdict` 落 `重仓` / `轻试` / `守成`。
  每步大运至少列一个流年窗口（哪怕全是坑年）。
- `transition` —— 换运前后一两年的风险与对策。
- `summary` —— 策略总纲：主业重仓 / 底盘待机 / 守成缓投，加若干条要点。

## 硬性规则

1. 输出**纯 JSON 对象**，不要用 markdown 代码块包裹，不要有任何额外解释文字。
2. 键名与枚举值**必须**严格取自 JSON Schema，**不得自造字段**。
3. 顶层 **13 个键一个不少**，顺序固定。
4. `pattern.verdict`（成格/破格/不清）与 `timeline[].verdict`（重仓/轻试/守成）
   是**两个不同的枚举**，不可混用、不可互相推导。
5. `xiJi.ciXi`（喜忌层次喜）与 `tiaoHou.secondaryDrug`（调候层次药）
   **分属两层**，不得互相顶替。
6. **不得重排四柱**、不得重算旺衰喜忌 —— 那些由程序负责。
7. 命理结论只作时机参考，不是保证书；涉及现实决策须提示结合政策、产权、资金、团队。
````

- [ ] **Step 3: 写失败的测试**

`backend/tests/llm-prompt.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const {
  extractSection,
  extractInterpretation,
  buildCareerSystemPrompt,
  buildCareerUserPrompt,
  buildChatSystemPrompt,
  buildChatUserPrompt,
} = require('../src/llm/prompt');

const SKILLS = path.join(__dirname, '..', 'skills', 'bazi-tuipan');

describe('skill 段落提取', () => {
  test('extractSection 取到指定段，且不含下一个二级标题', () => {
    const md = fs.readFileSync(path.join(SKILLS, 'shiye-master.skill.md'), 'utf8');
    const out = extractSection(md, '输出规范（固化在此文件，必须严格遵守）');
    expect(out).toContain('推进顺序');
    expect(out).not.toContain('## Interpretation');
  });

  test('extractSection 取不到时返回空串', () => {
    expect(extractSection('# 标题', '不存在的段')).toBe('');
  });

  test('extractInterpretation 取的是 Interpretation 段', () => {
    const md = fs.readFileSync(path.join(SKILLS, 'tiaohou-shiye', 'SKILL.md'), 'utf8');
    const out = extractInterpretation(md);
    expect(out).toContain('调候');
    expect(out).not.toContain('## A2');
  });
});

describe('阶段二的 system prompt', () => {
  const prompt = buildCareerSystemPrompt();

  test('包含事业推理合同', () => {
    expect(prompt).toContain('事业推理合同');
    expect(prompt).toContain('13 个键一个不少');
  });

  test('包含 5 个事业 skill 的知识段', () => {
    for (const name of ['tiaohou-shiye', 'geshi-shiye', 'wuxing-shiye', 'suiyun-shiye', 'shiye-master']) {
      expect(prompt).toContain(name);
    }
  });

  test('master 的输出规范与 Execution 都注入了（10 键的老版本不能出现）', () => {
    expect(prompt).toContain('推进顺序');
    expect(prompt).toContain('13 个顶层键');
    expect(prompt).not.toContain('10 个顶层键');
    expect(prompt).toContain('填 `patternTracks`');
  });

  test('10 键的旧键序串一处都不能漏进 prompt', () => {
    // master 的「输出规范」与「Interpretation」两处都写过 10 键键序串，
    // Task 2 已把两处都改掉；这里断言 prompt 里看不到旧串
    expect(prompt).not.toContain('case → monthCommand → pattern → tiaoHou');
    expect(prompt).toContain('case → monthCommand → pattern → patternTracks');
  });

  test('包含 JSON Schema', () => {
    expect(prompt).toContain('"case"');
    expect(prompt).toContain('"careerPhases"');
    expect(prompt).toContain('"directions"');
  });

  test('子 skill 的 A2 与 Execution 不进 prompt', () => {
    expect(prompt).not.toContain('Future Trigger');
  });
});

describe('阶段二的 user prompt', () => {
  test('带上了命盘 JSON', () => {
    const chart = { pillars: { year: '戊辰', month: '己未', day: '乙亥', hour: '乙酉' } };
    const p = buildCareerUserPrompt(chart);
    expect(p).toContain('戊辰');
    expect(p).toContain('不要重新计算');
  });
});

describe('阶段三的 chat prompt', () => {
  const careerJson = { case: { gender: '男' }, summary: { strategy: '底盘待机' } };
  const careerProse = '## 策略总纲\n底盘待机';
  const prompt = buildChatSystemPrompt(careerJson, careerProse);

  test('包含本命推理结果的 JSON 与散文', () => {
    expect(prompt).toContain('底盘待机');
    expect(prompt).toContain('## 策略总纲');
  });

  test('包含 skill 通用知识', () => {
    expect(prompt).toContain('wuxing-shiye');
    expect(prompt).toContain('suiyun-shiye');
  });

  test('不包含 master 的落笔指令（那是阶段二的事）', () => {
    expect(prompt).not.toContain('填 `case`');
    expect(prompt).not.toContain('产出校验');
  });

  test('user prompt 拼了历史与本轮提问', () => {
    const p = buildChatUserPrompt(
      [{ role: 'user', content: '我适合做什么行业？' }, { role: 'assistant', content: '宜向北发展。' }],
      '那我该往哪个方向搬家？',
    );
    expect(p).toContain('我适合做什么行业？');
    expect(p).toContain('那我该往哪个方向搬家？');
  });

  test('历史消息按角色标注：user 标「用户」、assistant 标「顾问」', () => {
    const p = buildChatUserPrompt(
      [{ role: 'user', content: '我适合做什么行业？' }, { role: 'assistant', content: '宜向北发展。' }],
      '那我该往哪个方向搬家？',
    );
    expect(p).toContain('用户：我适合做什么行业？');
    expect(p).toContain('顾问：宜向北发展。');
    expect(p).toContain('用户：那我该往哪个方向搬家？');
    // 本轮提问必须是最后一行
    expect(p.trim().split('\n').pop()).toBe('用户：那我该往哪个方向搬家？');
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

```bash
cd backend && npx jest tests/llm-prompt.test.js
```

预期：FAIL，报 `Cannot find module '../src/llm/prompt'`。

- [ ] **Step 5: 写实现**

`backend/src/llm/prompt.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_PATH = path.join(__dirname, '..', '..', 'skills', 'bazi-tuipan');
const CAREER_PROMPT_PATH = path.join(__dirname, '..', '..', 'prompts', 'CAREER_PROMPT.md');
const CAREER_SCHEMA_PATH = path.join(__dirname, '..', '..', 'prompts', 'CAREER_SCHEMA.md');

const INTERPRET_HEADING = 'Interpretation（核心方法论）';
const MASTER_SPEC_HEADING = '输出规范（固化在此文件，必须严格遵守）';
const MASTER_EXEC_HEADING = 'Execution（执行步骤）';

/** 阶段二注入的 4 个事业子 skill（只取 Interpretation） */
const CAREER_SUB_SKILLS = [
  'tiaohou-shiye',
  'geshi-shiye',
  'wuxing-shiye',
  'suiyun-shiye',
];

/**
 * 取 `## <heading>` 到下一个 `## ` 之间的正文。
 * @param {string} markdown
 * @param {string} heading 标题文字（不含 `## ` 前缀）
 * @returns {string} 取不到返回空串
 */
function extractSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return '';
  const rest = markdown.slice(start + marker.length);
  const end = rest.search(/\n##\s/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/**
 * 取 `## Interpretation（核心方法论）` 段。
 * 只有这一段是纯知识；A2 / Execution / Boundary 是流程与输出格式指令，不进 prompt。
 */
function extractInterpretation(markdown) {
  return extractSection(markdown, INTERPRET_HEADING);
}

/** 读一个 skill 文件的某一段 */
function readSkillSection(relPath, heading) {
  const full = path.join(SKILLS_PATH, relPath);
  return extractSection(fs.readFileSync(full, 'utf8'), heading);
}

/** 阶段二的 system prompt：合同 + 事业知识库 + JSON Schema */
function buildCareerSystemPrompt() {
  const contract = fs.readFileSync(CAREER_PROMPT_PATH, 'utf8');
  const schema = fs.readFileSync(CAREER_SCHEMA_PATH, 'utf8');

  let skills = '';
  for (const name of CAREER_SUB_SKILLS) {
    const body = extractInterpretation(
      fs.readFileSync(path.join(SKILLS_PATH, name, 'SKILL.md'), 'utf8'),
    );
    if (body) skills += `### ${name}\n${body}\n\n`;
  }

  // master 取三段：输出规范（含推进顺序与硬性规则）+ Interpretation + Execution（含落笔映射）。
  // 只取 Interpretation 会丢掉推进顺序、硬性规则、10→13 步的落笔映射。
  const masterMd = fs.readFileSync(path.join(SKILLS_PATH, 'shiye-master.skill.md'), 'utf8');
  const masterSpec = extractSection(masterMd, MASTER_SPEC_HEADING);
  const masterInterp = extractSection(masterMd, INTERPRET_HEADING);
  const masterExec = extractSection(masterMd, MASTER_EXEC_HEADING);
  let master = '';
  if (masterSpec) master += `### shiye-master · 输出规范\n${masterSpec}\n\n`;
  if (masterInterp) master += `### shiye-master · 核心方法论\n${masterInterp}\n\n`;
  if (masterExec) master += `### shiye-master · 执行步骤\n${masterExec}\n\n`;

  return [
    contract.trim(),
    '\n\n---\n\n## 事业择业知识库\n\n',
    (skills + master).trim(),
    '\n\n---\n\n## 输出格式规范\n\n',
    schema.trim(),
  ].join('\n');
}

/** 阶段二的 user prompt：命盘 JSON + 固定引导语 */
function buildCareerUserPrompt(chart) {
  return [
    '以下是程序离线算出的命盘 JSON。四柱、藏干、十神、纳音、空亡、十二长生、神煞、',
    '干支作用、旺衰打分、格局候选、大运流年都已算好，**请直接采用，不要重新计算**。',
    '',
    JSON.stringify(chart, null, 2),
    '',
    '请严格按 system 提示词末尾的 JSON Schema 输出事业推理结果，',
    '直接返回纯 JSON 对象，不要用 markdown 代码块包裹，不要有任何额外解释文字。',
  ].join('\n');
}

/** 阶段三的 system prompt：聊天合同 + 本命推理结果 + skill 通用知识 */
function buildChatSystemPrompt(careerJson, careerProse) {
  const contract = [
    '# 事业问答合同',
    '',
    '你是一位八字事业顾问。用户已经完成排盘与事业推理，',
    '下面是**这个命例本人**的事业推理结果，以及通用的事业择业方法论。',
    '',
    '## 回答规则',
    '',
    '1. 优先依据**本命事业推理结果**回答；它是对这个命例的具体结论。',
    '2. 涉及具体大运、流年、喜忌、格局的细节，**必须引用推理结果里的原文**，不要自己另推。',
    '3. 推理结果里没有直接结论的问题，可以用下面的通用方法论回答，但要**明说**',
    '   「这一点推理结果里没有直接结论，以下是通用判断」。',
    '4. **不得重排四柱、不得重算旺衰喜忌** —— 那些由程序负责，结论已固定。',
    '5. 命理结论只作时机参考，不是保证书；涉及现实决策要提示结合政策、产权、资金、团队。',
    '6. 回答用中文，语气自然、直接，不要客套开场白，不要复述问题。',
    '',
    '---',
    '',
    '## 本命事业推理结果（JSON）',
    '',
    '```json',
    JSON.stringify(careerJson, null, 2),
    '```',
    '',
    '## 本命事业推理结果（可读版）',
    '',
    careerProse,
    '',
    '---',
    '',
    '## 通用事业择业方法论',
    '',
  ].join('\n');

  let skills = '';
  for (const name of CAREER_SUB_SKILLS) {
    const body = extractInterpretation(
      fs.readFileSync(path.join(SKILLS_PATH, name, 'SKILL.md'), 'utf8'),
    );
    if (body) skills += `### ${name}\n${body}\n\n`;
  }

  return contract + '\n' + skills.trim();
}

/** 阶段三的 user prompt：历史消息 + 本轮提问 */
function buildChatUserPrompt(history, message) {
  const parts = [];
  for (const m of history || []) {
    if (!m || typeof m.content !== 'string') continue;
    // assistant 的历史回答标「顾问」，user 的历史提问标「用户」
    parts.push(`${m.role === 'assistant' ? '顾问' : '用户'}：${m.content}`);
  }
  parts.push(`用户：${message}`);
  return parts.join('\n');
}

module.exports = {
  extractSection,
  extractInterpretation,
  buildCareerSystemPrompt,
  buildCareerUserPrompt,
  buildChatSystemPrompt,
  buildChatUserPrompt,
  CAREER_SUB_SKILLS,
};
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd backend && npx jest tests/llm-prompt.test.js
```

预期：**15 个测试全绿**。

- [ ] **Step 7: 跑全量测试确认没打破基线**

```bash
cd backend && npm test
```

预期：全部绿。**若 `api.test.js` 失败**，多半是 `app.js` 里还挂着 `interpretRouter`（那个路由没拷贝）—— `app.js` 是在 **Task 8** 改的；若这里就挂了，先把 `app.js` 里 `require('./routes/interpret')` 与 `app.use('/api/interpret', interpretRouter)` 两行注释掉。

> 注意：`api.test.js` 里**没有**任何针对 `/api/interpret` 的断言，它断言的是 `/health` 的 `service` 字段与 `/api/paipan` 的返回。Task 8 改 `service` 时要同步改 `api.test.js` 的那两处断言。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(llm): 重写 prompt 组装 —— 多段 skill 提取 + 阶段二/阶段三两套 prompt"
```

---

## Task 7: 阶段二业务 —— 调模型、校验、重试、渲染

**Files:**
- Create: `backend/src/career/run.js`
- Test: `backend/tests/career-run.test.js`

**Interfaces:**
- Consumes: `src/llm/prompt.js` 的 `buildCareerSystemPrompt` / `buildCareerUserPrompt`；`src/llm/client.js` 的 `callMiniMax` / `parseLLMJson`；`src/career/validate.js` 的 `validateCareer`；`src/career/render.js` 的 `renderCareerProse`
- Produces:
  - `runCareerOnce(chart, options)` → `Promise<{data: object|null, parsed: boolean, defects: string[]}>`
  - `runCareerRounds(chart, options)` → `Promise<{data: object|null, prose: string, parsed: boolean, defects: string[]}>`
  - `options` 形状：`{ callLLM?: Function, maxRounds?: number }`（`callLLM` 缺省用 `client.callMiniMax`，供测试注入）

- [ ] **Step 1: 写失败的测试**

`backend/tests/career-run.test.js`：

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../src/llm/client', () => ({
  callMiniMax: jest.fn(),
  parseLLMJson: jest.fn(),
  friendlyError: jest.fn((e) => String(e && e.message)),
}));

const client = require('../src/llm/client');
const { runCareerOnce, runCareerRounds } = require('../src/career/run');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

const CHART = { pillars: { year: '戊辰', month: '己未', day: '乙亥', hour: '乙酉' } };

describe('阶段二的调用与校验', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('输出合规时返回数据', async () => {
    client.callMiniMax.mockResolvedValue('{"ok":true}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce(CHART);
    expect(r.data).not.toBeNull();
    expect(r.defects).toEqual([]);
  });

  test('输出不合规时返回 null 与缺陷列表', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const bad = JSON.parse(JSON.stringify(SAMPLE));
    delete bad.directions;
    client.parseLLMJson.mockReturnValue(bad);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.defects.join()).toContain('directions');
  });

  test('响应连 JSON 都不是时 parsed 为 false', async () => {
    client.callMiniMax.mockResolvedValue('这不是 JSON');
    client.parseLLMJson.mockReturnValue(null);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.parsed).toBe(false);
  });

  test('四柱被改写时判废', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const tampered = JSON.parse(JSON.stringify(SAMPLE));
    tampered.case.pillars.year = '庚午';
    client.parseLLMJson.mockReturnValue(tampered);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.defects.join()).toContain('四柱');
  });

  test('整轮重试：第一轮不合规、第二轮合规时返回第二轮的数据', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const bad = JSON.parse(JSON.stringify(SAMPLE));
    delete bad.directions;
    client.parseLLMJson
      .mockReturnValueOnce(bad)
      .mockReturnValueOnce(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerRounds(CHART, { maxRounds: 3 });
    expect(r.data).not.toBeNull();
    expect(client.callMiniMax).toHaveBeenCalledTimes(2);
  });

  test('多轮都不合规时返回 null，且不抛异常', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue({});
    const r = await runCareerRounds(CHART, { maxRounds: 2 });
    expect(r.data).toBeNull();
    expect(client.callMiniMax).toHaveBeenCalledTimes(2);
  });

  test('成功时附带渲染好的散文', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerRounds(CHART, { maxRounds: 1 });
    expect(r.prose).toContain('策略总纲');
    expect(r.prose).toContain('底盘待机');
  });

  test('注入的 callLLM 优先于默认实现', async () => {
    const fake = jest.fn().mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce(CHART, { callLLM: fake });
    expect(fake).toHaveBeenCalled();
    expect(r.data).not.toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx jest tests/career-run.test.js
```

预期：FAIL，报 `Cannot find module '../src/career/run'`。

- [ ] **Step 3: 写实现**

`backend/src/career/run.js`：

```javascript
'use strict';

const client = require('../llm/client');
const { buildCareerSystemPrompt, buildCareerUserPrompt } = require('../llm/prompt');
const { validateCareer } = require('./validate');
const { renderCareerProse } = require('./render');

/**
 * 跑一轮「调用 → 解析 → 校验」。
 * @returns {Promise<{data: object|null, parsed: boolean, defects: string[]}>}
 *   data 为 null 表示这轮不合规；parsed 表示「响应本身是合法 JSON 对象」。
 */
async function runCareerOnce(chart, options) {
  const opts = options || {};
  const callLLM = opts.callLLM || client.callMiniMax;

  let raw;
  try {
    raw = await callLLM([
      { role: 'system', content: buildCareerSystemPrompt() },
      { role: 'user', content: buildCareerUserPrompt(chart) },
    ]);
  } catch (error) {
    // 调用失败（含网络/超时/空 choices）由 client 内部重试；到这里说明重试后仍失败。
    return { data: null, parsed: false, defects: [String((error && error.message) || error)] };
  }

  const data = client.parseLLMJson(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { data: null, parsed: false, defects: ['响应不是 JSON 对象'] };
  }

  // 解读层不得重排四柱：命盘 JSON 是离线层与模型之间的唯一接口。
  // 模型若把四柱改写了，整份推理就是基于错误命盘生成的，必须当场判废。
  const modelPillars = data.case && data.case.pillars;
  const chartPillars = chart && chart.pillars;
  if (modelPillars && typeof modelPillars === 'object' && chartPillars) {
    for (const k of ['year', 'month', 'day', 'hour']) {
      if (typeof modelPillars[k] === 'string' && modelPillars[k] !== chartPillars[k]) {
        return {
          data: null,
          parsed: true,
          defects: [`四柱不一致：${k} 被改写为 ${modelPillars[k]}，离线命盘是 ${chartPillars[k]}`],
        };
      }
    }
  }

  const result = validateCareer(data);
  if (result.ok) return { data, parsed: true, defects: [] };
  return { data: null, parsed: true, defects: result.defects };
}

/**
 * 「调用 → 解析 → 校验」整轮重试。
 *
 * 模型输出是随机的：偶尔会漏字段、枚举写错。实测同一份命盘本地连跑两次都成功，
 * 所以单次不合规就判废会让这个功能「偶发失败」。重试通常就正常了。
 * 网络类错误（超时/5xx/空 choices）仍由 callMiniMax 内部重试，两层不冲突。
 *
 * @returns {Promise<{data: object|null, prose: string, parsed: boolean, defects: string[]}>}
 */
async function runCareerRounds(chart, options) {
  const opts = options || {};
  const maxRounds = Math.max(1, opts.maxRounds || 3);
  let parsed = false;
  let defects = [];

  for (let round = 1; round <= maxRounds; round++) {
    const r = await runCareerOnce(chart, opts);
    if (r.data) {
      return { data: r.data, prose: renderCareerProse(r.data), parsed: true, defects: [] };
    }
    parsed = r.parsed;
    defects = r.defects;
    console.error(
      `事业推理结果不符合契约（第 ${round}/${maxRounds} 轮），缺失或非法字段:`,
      defects.join('、') || '（整段不是合法 JSON）',
    );
  }
  return { data: null, prose: '', parsed, defects };
}

module.exports = { runCareerOnce, runCareerRounds };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx jest tests/career-run.test.js
```

预期：**8 个测试全绿**。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(career): 阶段二 —— 调模型、契约校验、整轮重试、渲染散文"
```

---

## Task 8: 会话编排路由（阶段一 + 阶段二）

**Files:**
- Create: `backend/src/routes/session.js`
- Modify: `backend/src/app.js`（挂载路由、去掉解读层）
- Test: `backend/tests/session.test.js`

**Interfaces:**
- Consumes: `src/chart/build.js` 的 `buildChart`；`src/routes/normalize-input.js` 的 `normalizeInput`；`src/career/run.js` 的 `runCareerRounds`
- Produces:
  - `POST /api/session` → 202 `{ success: true, sessionId, status: 'pending', chart }`
  - `GET /api/session/:id/status` → 200 `{ success: true, sessionId, status: 'pending'|'ready'|'error', error? }`
  - `GET /api/session/:id/chart` → 200 `{ success: true, chart }`
  - `GET /api/session/:id/career` → 200 `{ success: true, career: { json, prose } }`
  - `GET /api/session/:id/history` → 200 `{ success: true, history: Array<{role, content}> }`
  - `POST /api/session/:id/history` → 追加一条消息 → 200 `{ success: true }`

- [ ] **Step 1: 写失败的测试**

`backend/tests/session.test.js`：

```javascript
'use strict';

const request = require('supertest');

jest.mock('../src/career/run', () => ({
  runCareerRounds: jest.fn(),
}));

const { runCareerRounds } = require('../src/career/run');
const { createApp } = require('../src/app');

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 1, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

describe('会话编排', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    runCareerRounds.mockResolvedValue({
      data: { case: { gender: '男' } },
      prose: '## 策略总纲\n底盘待机',
      parsed: true,
      defects: [],
    });
  });

  test('提交后返回 202，并带回排盘结果', async () => {
    const res = await request(app).post('/api/session').send(VALID_BODY);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.status).toBe('pending');
    expect(res.body.chart.pillars.year).toBeTruthy();
  });

  test('参数非法时返回 400 与中文错误', async () => {
    const res = await request(app).post('/api/session').send({ ...VALID_BODY, year: 1800 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/year/);
  });

  test('轮询状态会从 pending 变成 ready', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    // 等后台任务跑完
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    expect(res.body.status).toBe('ready');
  });

  test('可以取回排盘结果与事业推理结果', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await new Promise((r) => setTimeout(r, 50));

    const chart = await request(app).get(`/api/session/${id}/chart`);
    expect(chart.body.chart.pillars.day).toBeTruthy();

    const career = await request(app).get(`/api/session/${id}/career`);
    expect(career.body.career.prose).toContain('底盘待机');
    expect(career.body.career.json).toBeTruthy();
  });

  test('阶段二失败时状态是 error，且带中文提示', async () => {
    runCareerRounds.mockResolvedValue({
      data: null, prose: '', parsed: true, defects: ['缺 directions'],
    });
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toBeTruthy();
  });

  test('会话不存在时返回 404 与中文错误', async () => {
    // 用纯 ASCII 的假 id —— 会话 id 里带中文会让 superagent 抛
    // 「Request path contains unescaped characters」，测的就不是 404 逻辑了。
    const res = await request(app).get('/api/session/no-such-session/status');
    expect(res.status).toBe(404);
    expect(res.body.errors[0]).toMatch(/不存在/);
  });

  test('可以追加与读取对话历史', async () => {
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const id = created.body.sessionId;
    await request(app)
      .post(`/api/session/${id}/history`)
      .send({ role: 'user', content: '我适合做什么行业？' });
    const res = await request(app).get(`/api/session/${id}/history`);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].content).toBe('我适合做什么行业？');
  });

  test('解读层的路由已不存在', async () => {
    const res = await request(app).post('/api/interpret').send(VALID_BODY);
    expect(res.status).toBe(404);
  });

  // 「两个路由的校验等价性」在 Task 1 的 input-validation.test.js 里被删掉了
  // （那时 /api/interpret 已被摘除，基线是 paipan vs interpret）。
  // 本产品的等价基准换成 paipan vs session —— 在这里补上。
  test('paipan 与 session 对同一份非法输入给出的 errors 完全一致', async () => {
    const BAD_CASES = [
      { label: '2 月 31 日', body: { year: 2024, month: 2, day: 31 } },
      { label: 'year 为数组', body: { year: [1990] } },
      { label: '缺少 province/city', body: { province: '', city: '' } },
      { label: 'gender 无法识别', body: { gender: 'x' } },
    ];
    for (const c of BAD_CASES) {
      const paipanRes = await request(app).post('/api/paipan/chart').send({ ...VALID_BODY, ...c.body });
      const sessionRes = await request(app).post('/api/session').send({ ...VALID_BODY, ...c.body });
      expect(paipanRes.status).toBe(400);
      expect(sessionRes.status).toBe(400);
      expect(sessionRes.body.errors).toEqual(paipanRes.body.errors);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx jest tests/session.test.js
```

预期：FAIL，报 `Cannot find module '../src/routes/session'`。

- [ ] **Step 3: 写实现**

`backend/src/routes/session.js`：

```javascript
'use strict';

const express = require('express');
const { buildChart } = require('../chart/build');
const { normalizeInput } = require('./normalize-input');
const { chineseError, CHART_ERROR_FALLBACK } = require('./error-text');
const { runCareerRounds } = require('../career/run');

const router = express.Router();

/**
 * 会话表：内存保存，进程重启即失效（与 v2 的 JOBS 表同款）。
 * 一个会话包含：命盘、事业推理结果、对话历史。
 */
const SESSIONS = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000;

function newSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function getSession(id) {
  return SESSIONS.get(id) || null;
}

/** 定期清理过期会话。 */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (s.status === 'pending') continue;
    if (now - s.createdAt > SESSION_TTL_MS) SESSIONS.delete(id);
  }
}, 5 * 60 * 1000).unref();

/**
 * POST /api/session
 * 提交八字：同步完成阶段一（离线排盘）并返回，阶段二（LLM 事业推理）在后台跑。
 */
router.post('/', async (req, res) => {
  const { errors, input } = normalizeInput(req.body || {});
  if (errors) {
    return res.status(400).json({ success: false, errors });
  }

  let chart;
  try {
    chart = buildChart(input, {
      trueSolarTime: req.body.trueSolarTime === undefined ? true : !!req.body.trueSolarTime,
      dayBoundary: req.body.dayBoundary === 1 ? 1 : 2,
      qiyunMethod: req.body.qiyunMethod === 2 ? 2 : 1,
    });
  } catch (error) {
    console.error('离线排盘失败:', error && error.message);
    return res.status(400).json({
      success: false,
      errors: [chineseError(error && error.message, CHART_ERROR_FALLBACK)],
    });
  }

  const sessionId = newSessionId();
  const session = {
    id: sessionId,
    status: 'pending',
    createdAt: Date.now(),
    chart,
    career: null,
    error: null,
    history: [],
  };
  SESSIONS.set(sessionId, session);

  // 后台跑阶段二；不 await，避免请求长时间挂起被边缘代理中断。
  const maxRounds = Math.max(1, parseInt(process.env.MINIMAX_CAREER_ROUNDS || '3', 10) || 3);
  Promise.resolve()
    .then(() => runCareerRounds(chart, { maxRounds }))
    .then((result) => {
      if (!result.data) {
        session.status = 'error';
        session.error = result.parsed
          ? '大模型返回的事业推理结果不完整，请稍后重试'
          : '大模型返回内容无法解析，请稍后重试';
        return;
      }
      session.career = { json: result.data, prose: result.prose };
      session.status = 'ready';
    })
    .catch((error) => {
      console.error('事业推理失败:', error && error.message);
      session.status = 'error';
      session.error = chineseError(
        (error && error.message) || String(error),
        '事业推理失败，请稍后重试',
      );
    });

  // 一并带回离线命盘：前端可以立刻显示，不用干等大模型那几十秒。
  res.status(202).json({ success: true, sessionId, status: 'pending', chart });
});

/** GET /api/session/:id/status —— 轮询 */
router.get('/:id/status', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({
    success: true,
    sessionId: session.id,
    status: session.status,
    error: session.error || undefined,
  });
});

/** GET /api/session/:id/chart —— 阶段一结果（供勘验新 tab） */
router.get('/:id/chart', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({ success: true, chart: session.chart });
});

/** GET /api/session/:id/career —— 阶段二结果（供勘验新 tab） */
router.get('/:id/career', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  if (!session.career) {
    return res.status(404).json({
      success: false,
      errors: [session.status === 'error' ? (session.error || '事业推理失败') : '事业推理尚未完成'],
    });
  }
  res.json({ success: true, career: session.career });
});

/** GET /api/session/:id/history —— 读对话历史 */
router.get('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  res.json({ success: true, history: session.history });
});

/** POST /api/session/:id/history —— 追加一条消息 */
router.post('/:id/history', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  const role = req.body && req.body.role;
  const content = req.body && req.body.content;
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, errors: ['消息格式不正确'] });
  }
  session.history.push({ role, content: content.trim() });
  res.json({ success: true, count: session.history.length });
});

module.exports = router;
```

- [ ] **Step 4: 改 `backend/src/app.js`**

把解读层路由的挂载删掉，加上会话路由：

```javascript
const paipanRouter = require('./routes/paipan');
const sessionRouter = require('./routes/session');
```

（**删掉** `const interpretRouter = require('./routes/interpret');`）

挂载部分：

```javascript
  app.use('/api/paipan', paipanRouter);
  app.use('/api/session', sessionRouter);
```

（**删掉** `app.use('/api/interpret', interpretRouter);`）

健康检查里的 `service` 字段改成 `'zhouyi-seg1-2'`。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && npx jest tests/session.test.js
```

预期：**9 个测试全绿**（提交 202 / 参数非法 400 / 轮询到 ready / 取回两个结果 / 阶段二失败转 error / 会话不存在 404 / 追加与读取历史 / 解读层路由已不存在 / paipan 与 session 校验等价）。

> 最后一条是 Task 1 的 `input-validation.test.js` 里删掉的那条「两个路由校验等价性」的**替代品**：
> v2 的基线是 paipan vs interpret，本产品没有 interpret 路由，基线换成 paipan vs session。
> 两条路由共用 `normalizeInput`，所以 `errors` 数组必须逐字相等。

- [ ] **Step 6: 跑全量测试**

```bash
cd backend && npm test
```

预期：全绿。

> **`api.test.js` 会挂 —— 因为健康检查的 `service` 字段改了。**
> 拷贝过来的 `backend/tests/api.test.js` 里有两处断言：
>
> - `:22` `expect(res.body.service).toBe('zhouyi-v2-offline');`
> - `:32` `expect(res.body.service).toBe('zhouyi-v2-offline');`
>
> `api.test.js` **没有**任何针对 `/api/interpret` 的断言，所以别去找那条不存在的断言。
> 把这两处改成 `'zhouyi-seg1-2'` 即可。
>
> `:181` 的 `expect(res.body.data.meta.engine).toBe('zhouyi-v2-offline')` **不用改** ——
> `meta.engine` 来自 `src/chart/build.js`，那是逐字拷贝的离线排盘引擎，
> 引擎名保持 v2 的原值是对的（它就是 v2 的引擎）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(session): 会话编排路由 —— 阶段一同步 + 阶段二异步"
```

---

## Task 9: chat 路由（阶段三）

**Files:**
- Create: `backend/src/routes/chat.js`
- Modify: `backend/src/app.js`（挂载 chat 路由）
- Test: `backend/tests/chat.test.js`

**Interfaces:**
- Consumes: `src/llm/prompt.js` 的 `buildChatSystemPrompt` / `buildChatUserPrompt`；`src/llm/client.js` 的 `callMiniMax`
- Produces: `POST /api/chat` → 200 `{ success: true, answer: string }`

- [ ] **Step 1: 写失败的测试**

`backend/tests/chat.test.js`：

```javascript
'use strict';

const request = require('supertest');

// 必须同时 mock career/run：否则 session 路由会真的去跑阶段二，
// 而 client 被 mock 后拿不到合法 JSON，session 永远是 error 状态，
// 下面的「回答原样返回」等测试全会拿到 409 而不是 200。
jest.mock('../src/career/run', () => ({
  runCareerRounds: jest.fn(),
}));

jest.mock('../src/llm/client', () => ({
  callMiniMax: jest.fn(),
  parseLLMJson: jest.fn(),
  friendlyError: jest.fn((e) => String(e && e.message)),
}));

const { runCareerRounds } = require('../src/career/run');
const client = require('../src/llm/client');
const { createApp } = require('../src/app');

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 1, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

/** 建一个 ready 状态的会话 */
async function makeReadySession(app) {
  const created = await request(app).post('/api/session').send(VALID_BODY);
  const id = created.body.sessionId;
  await new Promise((r) => setTimeout(r, 50));
  return id;
}

describe('chat 问答', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    runCareerRounds.mockResolvedValue({
      data: { case: { gender: '男' } },
      prose: '## 策略总纲\n底盘待机',
      parsed: true,
      defects: [],
    });
    client.callMiniMax.mockResolvedValue('宜向北发展，水运是黄金阶段。');
  });

  test('回答原样返回', async () => {
    const id = await makeReadySession(app);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: id, message: '我适合做什么行业？' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('宜向北发展，水运是黄金阶段。');
  });

  test('问题会写进会话历史', async () => {
    const id = await makeReadySession(app);
    await request(app).post('/api/chat').send({ sessionId: id, message: '我适合做什么行业？' });
    const hist = await request(app).get(`/api/session/${id}/history`);
    expect(hist.body.history.map((h) => h.content)).toContain('我适合做什么行业？');
  });

  test('会话不存在时返回 404', async () => {
    const res = await request(app).post('/api/chat').send({ sessionId: '不存在', message: '你好' });
    expect(res.status).toBe(404);
  });

  test('消息为空时返回 400', async () => {
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '  ' });
    expect(res.status).toBe(400);
  });

  test('会话还在推理中时返回 409', async () => {
    // 让阶段二永远不结束，session 停在 pending
    runCareerRounds.mockImplementation(() => new Promise(() => {}));
    const created = await request(app).post('/api/session').send(VALID_BODY);
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: created.body.sessionId, message: '你好' });
    expect(res.status).toBe(409);
  });

  test('模型报错时返回 500 与中文提示', async () => {
    client.callMiniMax.mockRejectedValue(new Error('timeout'));
    const id = await makeReadySession(app);
    const res = await request(app).post('/api/chat').send({ sessionId: id, message: '你好' });
    expect(res.status).toBe(500);
    expect(res.body.errors[0]).toMatch(/./);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx jest tests/chat.test.js
```

预期：FAIL，报 404（路由没挂）或 `Cannot find module '../src/routes/chat'`。

- [ ] **Step 3: 写实现**

`backend/src/routes/chat.js`：

```javascript
'use strict';

const express = require('express');
// 注意：这里用模块对象调用，不要解构成局部变量。
// 解构（const { callMiniMax } = require(...)）会在模块加载时把函数取出来，
// 之后替换 client.callMiniMax 就无效了 —— 端到端冒烟正是靠替换来注入假 LLM。
const client = require('../llm/client');
const { buildChatSystemPrompt, buildChatUserPrompt } = require('../llm/prompt');
const { chineseError } = require('./error-text');

const router = express.Router();

/**
 * POST /api/chat
 * 阶段三：基于本命事业推理结果 + 通用方法论回答事业问题。
 */
router.post('/', async (req, res) => {
  const body = req.body || {};
  const sessionId = body.sessionId;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!sessionId) {
    return res.status(400).json({ success: false, errors: ['缺少会话编号'] });
  }
  if (!message) {
    return res.status(400).json({ success: false, errors: ['请输入问题'] });
  }

  // 从会话表取。session 路由不导出 SESSIONS，这里通过 createApp 注入的共享表读取。
  const session = req.app.locals.sessions && req.app.locals.sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, errors: ['会话不存在或已过期'] });
  }
  if (session.status !== 'ready' || !session.career) {
    return res.status(409).json({
      success: false,
      errors: [session.error || '事业推理尚未完成，请稍后再问'],
    });
  }

  let answer;
  try {
    const raw = await client.callMiniMax([
      { role: 'system', content: buildChatSystemPrompt(session.career.json, session.career.prose) },
      { role: 'user', content: buildChatUserPrompt(session.history, message) },
    ]);
    answer = typeof raw === 'string' ? raw.trim() : '';
  } catch (error) {
    console.error('chat 调用失败:', error && error.message);
    return res.status(500).json({
      success: false,
      errors: [chineseError(error && error.message, '问答失败，请稍后重试')],
    });
  }

  if (!answer) {
    return res.status(500).json({ success: false, errors: ['大模型没有返回内容，请稍后重试'] });
  }

  // 记进历史：用户问 + 助手答
  session.history.push({ role: 'user', content: message });
  session.history.push({ role: 'assistant', content: answer });

  res.json({ success: true, answer });
});

module.exports = router;
```

- [ ] **Step 4: 改 `session.js` 导出共享表，改 `app.js` 挂载**

在 `backend/src/routes/session.js` 末尾把导出改成：

```javascript
module.exports = router;
module.exports.SESSIONS = SESSIONS;
```

在 `backend/src/app.js` 里：

```javascript
const sessionRouter = require('./routes/session');
const chatRouter = require('./routes/chat');
```

挂载：

```javascript
  app.use('/api/paipan', paipanRouter);
  app.use('/api/session', sessionRouter);
  app.use('/api/chat', chatRouter);

  // 会话表挂在 app.locals 上，供 chat 路由读取（session 路由的 SESSIONS 是同一个 Map）
  app.locals.sessions = sessionRouter.SESSIONS;
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && npx jest tests/chat.test.js
```

预期：**6 个测试全绿**。

- [ ] **Step 6: 跑全量测试并提交**

```bash
cd backend && npm test
```

```bash
git add -A
git commit -m "feat(chat): 阶段三问答路由 —— 基于推理结果与通用方法论回答"
```

---

## Task 10: 前端四页

**Files:**
- Modify: `backend/public/index.html`（加【提交】【开始聊天】按钮）
- Modify: `backend/public/js/app.js`（改按钮状态机）
- Create: `backend/public/chat.html`
- Create: `backend/public/js/chat.js`
- Create: `backend/public/chart.html`
- Create: `backend/public/career.html`
- Create: `backend/public/js/result.js`
- Test: `backend/scripts/frontend-smoke.js`（从 v2 拷贝后改断言 —— 见 Step 10 的逐段对照表）

**Interfaces:**
- Consumes: `POST /api/session`、`GET /api/session/:id/status`、`GET /api/session/:id/chart`、`GET /api/session/:id/career`、`POST /api/chat`
- Produces: 4 个可访问的页面

- [ ] **Step 1: 从 v2 拷贝前端冒烟脚本**

```bash
cp ../zhouyi_seg1_v2/backend/scripts/frontend-smoke.js backend/scripts/
```

v2 的 `frontend-smoke.js` 是 413 行、5 段检查。**本任务要改它的断言** ——
具体改哪几段、怎么改见 **Step 10**（那里有一张逐段对照表）。
先原样拷贝进来，Step 10 再改。

- [ ] **Step 2: 改 `index.html` 的按钮区**

把 v2 的两个按钮（`btnChart` / `btnInterpret`）换成：

```html
        <button id="btnSubmit" type="button"
          class="w-full sm:w-auto rounded-full bg-primary text-on-primary px-8 py-3 font-label-sm
                 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          提交
        </button>
        <button id="btnStartChat" type="button" disabled
          class="w-full sm:w-auto rounded-full bg-surface-variant text-on-surface-variant px-8 py-3
                 font-label-sm opacity-60 cursor-not-allowed focus:outline-none">
          开始聊天
        </button>
```

并把状态提示区保留为 `<p id="msg" class="msg"></p>`。

> **Tailwind 类名只能取 config 里已有的 token。** 本仓的 `tailwind.config.js` 从 v2 逐字拷贝，
> `fontFamily` 只有 `body-md / headline-lg-mobile / title-md / label-sm / display-lg / body-lg / headline-lg`，
> `fontSize` 同理 —— **没有 `title-lg`、没有 `label-lg`**；也没有装 `@tailwindcss/typography`，
> 所以 **`prose-*` 一律不存在**。
>
> 全部新页面的用词必须落在下面这张表里（已用 tailwindcss 3.4.17 实测生成过）：
>
> | 用途 | ✅ 可用 | ❌ 不存在 |
> |---|---|---|
> | 页面大标题 | `font-headline-lg text-headline-lg` | `font-title-lg` / `text-title-lg` |
> | 按钮、摘要行 | `font-label-sm text-label-sm` | `font-label-lg` / `text-label-lg` |
> | 正文 | `font-body-md text-body-md` | — |
> | 小节标题 | `font-title-md text-title-md` | — |
> | 散文段落 | `whitespace-pre-wrap` + `text-body-md` | `prose-sm`（无 typography 插件） |
>
> 其余用到的类（`max-w-[85%]`、`md:grid-cols-4`、`self-end`、`self-start`、`rounded-2xl`、`text-xs`、
> `gap-unit`、`whitespace-pre-wrap` 等）都是 Tailwind 内置的，**重新构建 CSS 后就会生成**（见 Step 10b）。

- [ ] **Step 3: 改 `app.js` 的按钮逻辑**

在 `app.js` 里删掉 `doInterpret` 相关的代码（`btnInterpret` 绑定、`doInterpret` 函数），加上：

```javascript
// ---- 会话 ----
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;          // 5 分钟（阶段二要调大模型出长文）
let currentSessionId = null;

async function submitSession() {
  setMsg('正在推事业结果，约需 30 秒…');
  document.getElementById('btnSubmit').disabled = true;
  document.getElementById('btnStartChat').disabled = true;

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collectForm()),
  });
  const json = await res.json();
  if (!res.ok) {
    setMsg((json.errors && json.errors[0]) || '提交失败，请检查出生信息', true);
    document.getElementById('btnSubmit').disabled = false;
    return;
  }

  currentSessionId = json.sessionId;
  // 命盘此刻已经算好了，先显示出来
  renderChart(json.chart);
  document.getElementById('chartSection').classList.remove('hidden');

  await pollSession();
}

async function pollSession() {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`/api/session/${currentSessionId}/status`);
    const json = await res.json();
    if (!res.ok) {
      setMsg((json.errors && json.errors[0]) || '查询失败，请重试', true);
      document.getElementById('btnSubmit').disabled = false;
      return;
    }
    if (json.status === 'ready') {
      setMsg('事业结果已就绪，可以开始聊天了');
      document.getElementById('btnStartChat').disabled = false;
      return;
    }
    if (json.status === 'error') {
      setMsg(json.error || '事业推理失败，请重试', true);
      document.getElementById('btnSubmit').disabled = false;
      return;
    }
  }
  setMsg('等待超时，请重试', true);
  document.getElementById('btnSubmit').disabled = false;
}

function startChat() {
  if (!currentSessionId) return;
  window.location.href = `./chat.html?session=${encodeURIComponent(currentSessionId)}`;
}
```

事件绑定（替换 v2 的 `btnChart` / `btnInterpret` 绑定）：

```javascript
  document.getElementById('btnSubmit').addEventListener('click', submitSession);
  document.getElementById('btnStartChat').addEventListener('click', startChat);
```

- [ ] **Step 4: 写 `chat.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>周易之易 · 事业问答</title>
<link rel="stylesheet" href="./css/tailwind.css">
<link rel="stylesheet" href="./css/style.css">
</head>
<body class="min-h-screen">
<main class="mx-auto w-full max-w-4xl px-4 py-8 flex flex-col gap-stack-gap-md relative z-10">
  <header class="flex flex-wrap items-center justify-between gap-2">
    <h1 class="font-headline-lg text-headline-lg text-primary">事业问答</h1>
    <div class="flex gap-2">
      <button id="btnChartResult" type="button"
        class="rounded-full bg-surface-variant text-on-surface-variant px-4 py-2 font-label-sm hover:opacity-90">
        八字排盘结果
      </button>
      <button id="btnCareerResult" type="button"
        class="rounded-full bg-surface-variant text-on-surface-variant px-4 py-2 font-label-sm hover:opacity-90">
        事业推理结果
      </button>
    </div>
  </header>

  <div id="messages" class="flex flex-col gap-unit"></div>

  <form id="chat-form" class="flex gap-2" onsubmit="return false;">
    <input id="chat-input" type="text" placeholder="问点关于事业的事，比如：我适合做什么行业？"
      class="flex-1 rounded-2xl border border-outline bg-surface px-4 py-3 font-body-md">
    <button id="btnSend" type="button"
      class="rounded-full bg-primary text-on-primary px-6 py-3 font-label-sm hover:opacity-90">
      发送
    </button>
  </form>

  <p id="msg" class="msg"></p>
</main>
<script src="./js/chat.js"></script>
</body>
</html>
```

- [ ] **Step 5: 写 `backend/public/js/chat.js`**

```javascript
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
```

- [ ] **Step 6: 写 `chart.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>周易之易 · 八字排盘结果</title>
<link rel="stylesheet" href="./css/tailwind.css">
<link rel="stylesheet" href="./css/style.css">
</head>
<body class="min-h-screen">
<main class="mx-auto w-full max-w-6xl px-4 py-8 flex flex-col gap-stack-gap-md relative z-10">
  <h1 class="font-headline-lg text-headline-lg text-primary">八字排盘结果</h1>
  <!-- app.js 的 renderChart() 会 getElementById('chartSection')，缺了会抛 TypeError -->
  <div id="chartSection">
    <div id="pillars" class="grid grid-cols-2 md:grid-cols-4 gap-stack-gap-sm"></div>
    <div id="derived"></div>
    <div id="interactions"></div>
    <div id="shensha"></div>
    <div id="analysis"></div>
    <div id="dayun"></div>
    <div id="liunian"></div>
  </div>
  <p id="msg" class="msg"></p>
</main>
<script src="./js/app.js"></script>
<script src="./js/result.js"></script>
</body>
</html>
```

> **`#chartSection` 不能省。** `app.js:193` 的 `renderChart()` 第一行就是
> `document.getElementById('chartSection').classList.remove('hidden')` —— 元素不存在会直接抛
> `TypeError: Cannot read properties of null`。`chart.html` 用了 `app.js` 的渲染函数，就得给它这个容器。

- [ ] **Step 7: 写 `backend/public/js/result.js`**

```javascript
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
```

> **`chart.html` 必须引入 `app.js`**（见 Step 6）—— 上面 `renderChart` 会优先调
> `window.renderChart`，也就是 app.js 那个版本；它内部才会去碰 `#chartSection`。
> 所以 `#chartSection` 依然要留在 chart.html 里。

- [ ] **Step 8: 写 `career.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>周易之易 · 事业推理结果</title>
<link rel="stylesheet" href="./css/tailwind.css">
<link rel="stylesheet" href="./css/style.css">
</head>
<body class="min-h-screen">
<main class="mx-auto w-full max-w-4xl px-4 py-8 flex flex-col gap-stack-gap-md relative z-10">
  <h1 class="font-headline-lg text-headline-lg text-primary">事业推理结果</h1>
  <div id="careerOut"></div>
  <p id="msg" class="msg"></p>
</main>
<script src="./js/result.js"></script>
</body>
</html>
```

- [ ] **Step 9: 让 `app.js` 的渲染函数可被 `result.js` 复用**

`app.js` 里的 `renderPillars` / `renderDerived` 等函数是普通函数声明，在全局作用域下可用；但 `result.js` 里 `chart.html` **没有引入 `app.js`**。所以 `chart.html` 要同时引 `app.js` 与 `result.js`：

把 `chart.html` 的 script 段改成：

```html
<script src="./js/app.js"></script>
<script src="./js/result.js"></script>
```

> **`app.js` 的初始化必须逐个元素做存在性判断。**
> v2 的 `app.js` 末尾是这样写的（`app.js:378-386`）：
>
> ```javascript
> document.addEventListener('DOMContentLoaded', () => {
>   loadCities();
>   document.getElementById('province').addEventListener('change', fillCities);
>   document.getElementById('btnChart').addEventListener('click', doChart);
>   document.getElementById('btnInterpret').addEventListener('click', doInterpret);
>   const dayBoundary = document.getElementById('dayBoundary');
>   dayBoundary.addEventListener('change', syncDayBoundaryHint);
>   syncDayBoundaryHint();
> });
> ```
>
> 这段在 `chart.html` 上**每一行都会炸**：`province` / `btnChart` / `btnInterpret` / `dayBoundary`
> 四个元素在勘验页都不存在，`getElementById` 返回 `null`，`null.addEventListener` 抛 TypeError。
>
> **整段替换成**：
>
> ```javascript
> document.addEventListener('DOMContentLoaded', () => {
>   // 输入页才有的元素：勘验页上没有，跳过绑定
>   const province = document.getElementById('province');
>   if (province) {
>     loadCities();
>     province.addEventListener('change', fillCities);
>   }
>
>   const dayBoundary = document.getElementById('dayBoundary');
>   if (dayBoundary) {
>     dayBoundary.addEventListener('change', syncDayBoundaryHint);
>     syncDayBoundaryHint();
>   }
>
>   const btnSubmit = document.getElementById('btnSubmit');
>   if (btnSubmit) btnSubmit.addEventListener('click', submitSession);
>
>   const btnStartChat = document.getElementById('btnStartChat');
>   if (btnStartChat) btnStartChat.addEventListener('click', startChat);
> });
> ```
>
> 同时**删掉** `app.js` 里的解读层代码：`doInterpret` 函数、`btnInterpret` 的绑定、
> `renderInterpret` 函数、`INTERPRET_SECTIONS` / `INTERPRET_FIELDS` 两个常量。
> `esc()`、`flatten()` **保留** —— `renderPillars` / `table` / `renderAnalysis` 等还在用 `esc()`。
>
> **输入页的 `index.html` 里也要删掉解读层留下的 DOM**：`#interpretSection` 与 `#interpretOut`
> 两个元素（v2 的 `index.html` 里有），它们现在没有对应的渲染函数了，留着是死代码。

- [ ] **Step 10: 重写 `frontend-smoke.js` 的断言**

v2 的 `frontend-smoke.js`（413 行）有 5 段，本产品要改 4 段：

| v2 的段 | 本产品怎么处理 |
|---|---|
| ① 渲染 3 个真实命盘，断言无 `undefined` / `NaN` / `[object Object]` | **保留**（`app.js` 的排盘渲染没变） |
| ② `glass-card` 出现在 CSS 里 | **保留** |
| ③ XSS：用 `sandbox.renderInterpret(XSS_PAYLOADS)` 喂恶意载荷 | **删掉** —— 解读层没了，`renderInterpret` 也不存在了。改为喂 `sandbox.renderPillars`（把恶意载荷塞进 `chart.derived`），断言渲染结果里没有裸 `<script>` |
| ③b 嵌套 XSS：`sandbox.renderInterpret(NESTED_XSS_PAYLOADS)` | **同上删掉** |
| ④ `esc()` 的引号转义 | **保留** |
| ⑤ 死类扫描：只扫 `index.html` + `app.js`，对照已构建的 `tailwind.css` | **扩大**：扫 `index.html` + `chat.html` + `chart.html` + `career.html` + `app.js` + `chat.js` + `result.js` |
| `checkDefaults()`：查输入页默认值（李明 / 男 / 1990-01-15 / 10:30 / 北京市 / 东城区） | **保留** |

**① 里有一处必须改**：v2 断言 `typeof sandbox.renderInterpret === 'function'`，
本产品的 `app.js` 已删掉 `renderInterpret`，这条断言必然失败 —— **删掉它**。
`typeof sandbox.renderChart === 'function'` 与 `typeof sandbox.esc === 'function'` **保留**。

**③ 替换后必须自己喂一个像样的 `chart` 桩**：`renderPillars` 读的是
`chart.derived[k].ganZhi / gan / zhi / naYin / changSheng / ganShiShen`，
少一个字段就是 `undefined` 拼进 innerHTML（不报错，但渲染出一堆 `undefined`）。
`ganShiShen` 为空时 `renderPillars` 会走 `（日主）` 分支，这是允许的。

> **已实测**（vm 里跑 v2 的 `app.js`，往 `chart.derived.year` 塞
> `<script>alert(1)</script>` / `<img src=x onerror=alert(1)>` / `'><svg onload=alert(1)>`）：
> 渲染结果里**没有**裸 `<script`、**没有**裸 `onerror=`、**没有**裸 `<svg`，
> 且能看到 `&lt;script` 的转义形式 —— `renderPillars` 走的是 `esc()`，转义没问题。

**⑤ 死类扫描必须先重新构建 CSS**（见 Step 10b），否则新页面用的
`max-w-[85%]` / `md:grid-cols-4` / `self-end` / `self-start` / `whitespace-pre-wrap` / `rounded-2xl` / `text-xs`
在旧 `tailwind.css` 里全都没有，扫描会报一堆「死类」。

扫描时 `app.js` 里已删掉 `renderInterpret` 的 `INTERPRET_SECTIONS` / `INTERPRET_FIELDS`
相关类名也不用管 —— 它们本来就不在 HTML 里。

> **已实测**：把本计划 Step 4/6/8 的三个 HTML 与 Step 5/7 的两个 JS 抽出来，
> 连同 v2 的 `index.html` + `app.js` 一起喂给 tailwindcss 3.4.17 构建，
> 共用掉 **52 个类**，构建产物里**一个不缺**（逐个比对 CSS 选择器），
> 且 `font-title-lg` / `text-title-lg` / `font-label-lg` / `text-label-lg` / `prose-sm`
> **一个都没被用到**。
> 构建产物从 v2 的 14432 字节涨到 15201 字节 —— 这 769 字节就是四个新页面的类。

- [ ] **Step 10b: 重新构建 Tailwind CSS（必须做）**

拷贝过来的 `backend/public/css/tailwind.css` 是 v2 构建时产物，**只含 v2 那三个页面的类**。
新增四个页面后必须重新构建，否则新类全部失效（页面会没有样式）：

```bash
cd backend && npm run build:css
```

预期输出：`Done in xxx ms`，且 `backend/public/css/tailwind.css` 变大。

验证新类确实生成了（每条都要有输出，**每条都应是 `1` 或更大**）：

```bash
cd backend
grep -cF 'max-w-\[85'       public/css/tailwind.css
grep -cF 'md\:grid-cols-4'  public/css/tailwind.css
grep -cF 'self-end'         public/css/tailwind.css
grep -cF 'whitespace-pre-wrap' public/css/tailwind.css
grep -cF 'font-headline-lg' public/css/tailwind.css
grep -cF 'font-title-md'    public/css/tailwind.css
grep -cF 'gap-unit'         public/css/tailwind.css
```

> **必须用 `grep -cF`（固定字符串），不要用 `grep -c`。**
> 构建产物是 **minify 过**的，Tailwind 会把类名里的特殊字符转义：
> `max-w-[85%]` 在 CSS 里写作 `.max-w-\[85\%\]`，`md:grid-cols-4` 写作 `.md\:grid-cols-4`。
> 普通 `grep` 的基本正则里 `\[` 是「字符类开始」，写成 `grep -c "max-w-\\\[85"` 会直接报
> `grep: Unmatched [` —— **命令报错，看起来像「类没生成」，其实是命令写错了**。
> `-F` 表示按固定字符串匹配，反斜杠按字面处理，结果才对。

> **不要用 `font-title-lg` / `text-title-lg` / `font-label-lg` / `text-label-lg` / `prose-sm`** ——
> 这五个类**永远不会生成**（config 里没有 `title-lg` / `label-lg` 字号字体 token，也没装 typography 插件）。
> 见 Step 2 的对照表。

- [ ] **Step 10c: 跑前端冒烟**

```bash
cd backend && npm run smoke:frontend
```

预期：全部通过（5 段检查 + `checkDefaults`）。

若报「死类」：先确认 Step 10b 跑过（`tailwind.css` 是否已重建），
再确认那个类名确实在 config 或 Tailwind 内置清单里。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat(frontend): 四个页面 —— 输入页双按钮、聊天页、两个勘验页"
```

---

## Task 11: 端到端冒烟与部署配置

**Files:**
- Create: `backend/scripts/smoke-e2e.js`
- Modify: `README.md`（新建）
- Test: `backend/scripts/smoke-e2e.js`

> `backend/.env.example` 已在 **Task 1 Step 5** 建好（含 `MINIMAX_CAREER_ROUNDS=3`），本任务不重复创建。
> 根 `package.json` 的 `smoke:e2e` 脚本在 Step 3 加。

**Interfaces:**
- Consumes: 全部前置任务
- Produces: `npm run smoke:e2e` —— 不调用真实 LLM 的端到端冒烟

- [ ] **Step 1: 写 `backend/scripts/smoke-e2e.js`**

用假的 LLM 跑通全链路（不调真实模型、不花 token）：

```javascript
'use strict';

/**
 * 端到端冒烟：注入假 LLM，跑通「提交 → 轮询 → 取两个结果 → 问一句话」全链路。
 * 不调真实模型，不花 token。
 */

const path = require('path');
const fs = require('fs');

// 先替换 client 里的 callMiniMax，再加载 app。
const clientPath = require.resolve('../src/llm/client');
const client = require(clientPath);

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

const VALID_BODY = {
  name: '李明',
  gender: '男',
  year: 1990, month: 5, day: 15, hour: 10, minute: 30, second: 0,
  province: '北京市', city: '东城区',
};

// 假 LLM：阶段二返回基准样例，阶段三返回一句话。
let callCount = 0;
client.callMiniMax = async (messages) => {
  callCount++;
  if (messages[0].content.includes('事业推理合同')) {
    // 阶段二：把样例的四柱换成**本次输入真实排出来的四柱**。
    // 不换的话 runCareerOnce 的「四柱不得被改写」检查会判废，
    // 会话状态变成 error，冒烟就挂在「会话状态变成 ready」那一步。
    const response = JSON.parse(JSON.stringify(SAMPLE));
    response.case.pillars = expectedPillars;
    return JSON.stringify(response);
  }
  return '宜向北发展，水运是深耕专业、铺底盘的黄金阶段。';
};

const request = require('supertest');
const { createApp } = require('../src/app');
const { buildChart } = require('../src/chart/build');
const { normalizeInput } = require('../src/routes/normalize-input');

// 用与 session 路由完全相同的参数排一次盘，拿到期望的四柱。
const normalized = normalizeInput(VALID_BODY);
if (normalized.errors) {
  console.error('冒烟输入本身就不合法：' + normalized.errors.join('；'));
  process.exit(1);
}
const expectedChart = buildChart(normalized.input, {
  trueSolarTime: true,
  dayBoundary: 2,
  qiyunMethod: 1,
});
const expectedPillars = {
  year: expectedChart.pillars.year,
  month: expectedChart.pillars.month,
  day: expectedChart.pillars.day,
  hour: expectedChart.pillars.hour,
};

function fail(message) {
  console.error('✗ ' + message);
  process.exitCode = 1;
}

function ok(message) {
  console.log('✓ ' + message);
}

async function main() {
  const app = createApp();

  const created = await request(app).post('/api/session').send(VALID_BODY);
  if (created.status !== 202) {
    fail(`提交应返回 202，实际 ${created.status}`);
    return;
  }
  const id = created.body.sessionId;
  ok('提交返回 202，sessionId=' + id);

  if (!created.body.chart || !created.body.chart.pillars.year) {
    fail('202 响应里应带回命盘');
    return;
  }
  ok('202 响应带回命盘：' + created.body.chart.pillars.year);

  // 轮询到 ready
  let status = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get(`/api/session/${id}/status`);
    status = res.body.status;
    if (status === 'ready' || status === 'error') break;
  }
  if (status !== 'ready') {
    fail('会话应变成 ready，实际 ' + status);
    return;
  }
  ok('会话状态变成 ready');

  const chart = await request(app).get(`/api/session/${id}/chart`);
  if (!chart.body.chart) {
    fail('应能取回排盘结果');
    return;
  }
  ok('取回排盘结果');

  const career = await request(app).get(`/api/session/${id}/career`);
  if (!career.body.career || !career.body.career.prose.includes('策略总纲')) {
    fail('应能取回含散文的事业推理结果');
    return;
  }
  ok('取回事业推理结果（含散文）');

  const chat = await request(app).post('/api/chat').send({ sessionId: id, message: '我适合做什么行业？' });
  if (!chat.status || chat.status !== 200 || !chat.body.answer) {
    fail('chat 应返回 200 与回答，实际 ' + chat.status);
    return;
  }
  ok('chat 回答：' + chat.body.answer.slice(0, 30) + '…');

  const hist = await request(app).get(`/api/session/${id}/history`);
  if (!hist.body.history || hist.body.history.length !== 2) {
    fail('历史应有 2 条（用户问 + 助手答），实际 ' + (hist.body.history || []).length);
    return;
  }
  ok('对话历史记了 2 条');

  console.log('\n冒烟全部通过（共调用假 LLM ' + callCount + ' 次）');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

> **两处必须这么写，否则冒烟必挂：**
>
> 1. **`chat.js` 里必须通过模块对象调 `callMiniMax`**，不能解构成局部变量。
>    `chat.js` 顶部若写 `const { callMiniMax } = require('../llm/client');`，
>    那是在**模块加载时**就把函数取出来了；本脚本 `require('../src/app')` 在替换之后，
>    拿到的仍是替换后的函数 —— 但只要 `chat.js` 在替换**之前**被加载过，
>    替换就完全无效，冒烟会真的去调 MiniMax。
>    **本仓的 `chat.js` 统一写成 `const client = require('../llm/client');`，
>    调用处写 `client.callMiniMax(...)`**（见 Task 9 的实现）。
>
> 2. **假 LLM 必须回填真实四柱**。`runCareerOnce` 有一条硬检查：模型返回的四柱与离线命盘
>    不一致就判废。样例里的四柱（戊辰 己未 乙亥 乙酉）跟 `1990-05-15` 排出来的对不上，
>    不回填的话会话会变成 `error` 状态。

- [ ] **Step 2: 跑冒烟**

```bash
cd backend && node scripts/smoke-e2e.js
```

预期输出：

```
✓ 提交返回 202，sessionId=sess_xxx
✓ 202 响应带回命盘：庚午
✓ 会话状态变成 ready
✓ 取回排盘结果
✓ 取回事业推理结果（含散文）
✓ chat 回答：宜向北发展，水运是深耕专业、铺底盘的黄金阶段…
✓ 对话历史记了 2 条

冒烟全部通过（共调用假 LLM 2 次）
```

> **`庚午` 是实测值，不是估的。**
> 冒烟的输入是 `1990-05-15 10:30`（真太阳时、00:00 换日），
> 用 v2 的 `buildChart` 跑出来是 `庚午 辛巳 庚辰 辛巳` —— 年柱 `庚午`。
>
> 如果换成了别的输入日期，**以实际输出为准**：把 `expectedPillars` 那几行跑一遍就能知道，
> 但**不要改断言去迁就输出** —— 先确认输出与输入相符，再改期望值。
> 冒烟脚本已经自己排了一次盘（`expectedChart`），
> 它算出来的 `expectedPillars.year` 就是本机跑出来的真实年柱。

- [ ] **Step 3: 在 `backend/package.json` 加冒烟脚本**

```json
    "smoke:e2e": "node scripts/smoke-e2e.js",
```

- [ ] **Step 4: 写 `README.md`**

````markdown
# 周易之易 · 事业推盘 + 事业问答

把 `zhouyi_seg1_v2` 的离线排盘引擎与 `zhouyi_seg2` 的事业择业 skill 知识库
整合成一个单页产品。

## 它做什么

1. **输入页**填出生信息 → 点【提交】
2. 后台跑两个阶段：
   - **阶段一**：离线排盘（零 LLM 调用），产出 12 字段命盘 JSON
   - **阶段二**：五个事业择业 skill + 命盘 → 结构化事业推理 JSON（13 键）→ 渲染成散文文档
3. 算完后【开始聊天】按钮可点 → 进聊天页问事业问题
4. 聊天页有两个按钮，**开新 tab** 显示两个阶段的结果，供人工勘验

## 快速开始

```bash
npm run install:all
cd backend && cp .env.example .env      # 填 MINIMAX_API_KEY
npm start
```

打开 http://localhost:3000

## 测试

```bash
npm test                        # 全部单元测试
cd backend && npm run smoke:e2e        # 端到端冒烟（注入假 LLM，不花 token）
cd backend && npm run smoke:frontend   # 前端冒烟
cd backend && npm run validate:schema  # 契约生成物与源一致
```

## 目录

| 路径 | 内容 |
|---|---|
| `docs/CAREER_SCHEMA.md` | **事业推理 JSON 契约（唯一手写源）** |
| `docs/CAREER_SCHEMA.sample.json` | 基准用例期望输出 |
| `docs/SHIYE_MASTER_DIFF.md` | `shiye-master.skill.md` 的改写记录 |
| `docs/superpowers/specs/` | 设计规格 |
| `backend/src/career/` | 契约常量、运行时校验器、散文渲染器、阶段二编排 |
| `backend/src/llm/prompt.js` | skill 多段提取 + 阶段二/阶段三 prompt 组装 |
| `backend/src/routes/` | `paipan` / `session` / `chat` |
| `backend/skills/bazi-tuipan/` | 16 个基线 skill + 5 个事业择业 skill |

## 契约

顶层 13 键，顺序即输出顺序：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

`docs/CAREER_SCHEMA.md` 是**唯一手写源**；注入 prompt 的
`backend/prompts/CAREER_SCHEMA.md` 由 `npm run build:schema` 生成。
**改契约改源文件，然后重新生成并跑 `npm run validate:schema`。**

## 部署约束

- 长请求会被边缘代理中断 ⇒ 阶段二**必须**异步 + 轮询（本设计已满足）。
- `backend/.env` 不进 Git；`MINIMAX_API_KEY` 只从环境变量读。
- 模型：`MINIMAX_MODEL` 默认 `MiniMax-M3`，`MINIMAX_THINKING` 默认 `disabled`
  （深度思考会吃掉 max_tokens 预算，把 JSON 截断）。
- 阶段二输出较长，`MINIMAX_MAX_TOKENS` 可能需要上调。
````

- [ ] **Step 5: 跑全量测试**

```bash
npm test
```

预期：全绿。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "test: 端到端冒烟 + README 与部署说明"
```

---

## 附录 A: 任务依赖图

```
Task 1（骨架）
  ├─→ Task 2（事业 skill + 改写 master）
  │     └─→ Task 6（prompt.js 依赖 skill 段落）
  ├─→ Task 3（契约源 + 生成 + 常量）
  │     ├─→ Task 4（校验器）
  │     └─→ Task 5（渲染器）
  ├─→ Task 6（prompt.js）
  │     └─→ Task 7（阶段二业务）
  │           └─→ Task 8（会话编排）
  │                 ├─→ Task 9（chat）
  │                 └─→ Task 10（前端）
  └─→ Task 11（端到端冒烟 + README）
```

**关键串行点**：Task 3 → Task 4 → Task 5 → Task 7 → Task 8 → Task 9。
Task 2 必须在 Task 6 之前完成（prompt.js 要读改写后的 master）。

## 附录 B: 与设计规格的对应

| 设计规格章节 | 实现任务 |
|---|---|
| §4 仓结构 | Task 1、2 |
| §5.1 阶段一（离线排盘） | Task 1（直接用 v2 的引擎） |
| §5.2.1 多段 skill 提取 | Task 6 |
| §5.2.1.1 master 三段改写 | Task 2 |
| §5.2.2 13 键契约 | Task 3 |
| §5.2.3 逐段对齐表 | Task 3（契约源）、Task 5（渲染） |
| §5.2.4 8 组枚举 | Task 3、4 |
| §5.2.5 必填/可空 | Task 3、4 |
| §5.2.6 渲染规则 | Task 5 |
| §5.2.7 校验 | Task 4、7 |
| §5.3 阶段三 chat | Task 6、9 |
| §5.4 会话与接口 | Task 8、9 |
| §6 前端 | Task 10 |
| §7 测试 | 每个 Task 自带 + Task 11 |
| §8 部署 | Task 11 |
| §10 单一源 + 生成 | Task 3 |

**与规格 §7 的两处已知偏差（规格已同步修订）**：

1. 规格 §7 列了独立的 `career-sample.test.js`；本计划**没有**这个文件。
   样例契约的覆盖被并进了 `backend/tests/career-validate.test.js`（基准样例必须通过校验、
   缺键报错、键序报错、枚举非法报错等 14 条断言都在那个文件里）。
   理由：样例只有一个，再开一个测试文件没有额外收益，合并后「样例 ↔ 校验器」的绑定关系更清楚。
2. 规格 §5.2.1.1 原写「改写 **5 处**」，实际是 **6 处** —— 漏了 `shiye-master.skill.md:43`
   （Interpretation 段里的 10 键键序串）。那一行会被 `buildCareerSystemPrompt()` 注入 system prompt，
   不改的话模型运行期仍会看到 10 键的键序，与 13 键契约矛盾。详见 Task 2。

## 附录 C: 实施时容易踩的坑

> 下面每一条都是**实测出来的**，不是推测。括号里是实测时用的方法。

1. **别把 v2 的解读层抄进来**。`app.js` 里 `interpretRouter` 的挂载、`client.js` 里的 `REQUIRED_INTERPRET_*`、
   `prompts/INTERPRET_*.md`、`routes/interpret.js` —— 一个都不该出现在新仓。
2. **`extractInterpretation` 只取一段不够**。master 的「输出规范」「Execution」在 Interpretation 之外，
   只取一段会让模型按 10 键输出（Task 2 已改写，但 Task 6 的提取器也要取三段）。
3. **`timeline` 的粒度**：schema 是**单步大运**，散文才是**五行分组**。别在 schema 层合并。
4. **`secondaryDrug` 取丙火**（txt 口径），不是柔金（六气机口径）。Task 3 的契约文档已写明。
5. **别用估计值**。所有数字要么实测，要么在测试里断言出来。
6. **新断言必须先红后绿**。Task 2/4/5/6/7 的测试都是先写、先跑（红）、再实现（绿）。
7. **`git push` 不要在任务里做** —— 统一由主控在阶段结束时推。

以下是实测中踩到、容易重犯的坑：

8. **删 `interpretRouter` 必须连 `app.use` 一起删**（Task 1 Step 1b）。
   只删 `require` 不删挂载，或只删挂载不删 `require`，都会让 `app.js` 在加载时抛
   `MODULE_NOT_FOUND`，**所有**测试文件一起挂 —— 表现为「测试全红」而不是「某个测试红」，
   很容易误判成实现写错了。
9. **Tailwind 类名必须对着 `tailwind.config.js` 核**（Task 10）。
   本仓的 config 里 `fontSize` 是 `body-md / headline-lg / title-md / label-sm / display-lg / body-lg / headline-lg`，
   **没有** `title-lg`、**没有** `label-lg`；且**没装 typography 插件**，所以 `prose-sm` 永远不存在。
   写错类名的后果不是「样式丑」，而是**那条元素根本没有那个样式**。
   核法：拿 `npx tailwindcss` 对着 config 跑一遍，看生成的 CSS 里有没有那个类。
10. **拷过来的 `tailwind.css` 是构建产物**（Task 10 Step 10b）。
    改了 HTML/JS 里的类名之后**必须重新 `npm run build:css`**，否则新类名不生效 —— 页面看着像没生效的 bug。
11. **`app.js` 的 `DOMContentLoaded` 是无条件的**（Task 10）。
    v2 的 `app.js` 在 `DOMContentLoaded` 里无条件调 `loadCities()` 并摸 `province` / `dayBoundary` / `btnChart` / `btnInterpret`。
    chart.html 上这些元素不存在 ⇒ `TypeError` ⇒ 排盘结果根本渲染不出来。
    抄过来后必须给这些操作加存在性判断。
12. **chart.html 必须有 `#chartSection`**（Task 10）。
    `renderChart()` 里有 `document.getElementById('chartSection').classList.remove('hidden')`，
    元素不存在就是 `TypeError`。
13. **markdown 围栏不能提前收**（Task 2 / 3 / 6 / 11）。
    外层 ```markdown 块里若含内层 ``` 代码块，外层必须用 **4 个反引号**；
    CommonMark 规定收尾围栏长度**不得小于**开启围栏。用 3 个反引号开、里面又有 ```，
    CommonMark 会认为外层已被闭合 ⇒ 渲染错乱。
    自检：把计划里的每个含内层围栏的块都按 CommonMark 解析一遍。
14. **渲染测试的锚点要用真实输出里的段标题**（Task 5）。
    断言 `喜用` / `忌神` 这种**词**必然失败 —— 输出里是 `喜：` / `次喜：` / `忌：`。
    锚点应当是 `## 喜忌` 这类**完整段标题**，且要与 `renderCareerProse` 实际写出的字完全一致。
    核法：把 `render.js` 抽出来跑一遍，print 出真实输出，再照着写断言。
15. **`validateGenerated` 的「篡改」必须落在生成物能反映的地方**（Task 3）。
    `buildSchemaMarkdown` 只提取 ```json 机读块与枚举表 —— 在源文件**末尾追加**一行「改动」
    不会改变生成物，`validateGenerated` 就查不出不同步，测试反而会失败（期望 1 条错误，实得 0 条）。
    正确做法是改机读块里的 `required` 数组（改键数会体现在生成物的「顶层 N 个键」上）。
16. **假 LLM 必须回填真实四柱**（Task 11）。
    `runCareerOnce` 有一条硬检查：模型返回的四柱与离线命盘不一致就判废，会话状态变 `error`。
    冒烟里的假 LLM 若直接回基准样例（样例四柱 `戊辰 己未 乙亥 乙酉` 跟 `1990-05-15` 排出来的不一样），
    冒烟会挂在「会话状态变成 ready」那一步。
17. **`chat.js` 要通过模块对象调 `callMiniMax`**（Task 9 / Task 11）。
    `const { callMiniMax } = require('../llm/client')` 会在**模块加载时**把函数取出来，
    之后替换 `client.callMiniMax` 就无效了 —— 端到端冒烟正是靠替换来注入假 LLM。
    一律写成 `const client = require('../llm/client')` + `client.callMiniMax(...)`。
18. **`api.test.js` 会挂，但挂点不是 `/api/interpret`**（Task 8）。
    v2 的 `api.test.js` 里**没有**任何针对 `/api/interpret` 的断言；
    它挂是因为健康检查的 `service` 字段从 `'zhouyi-v2-offline'` 改成了 `'zhouyi-seg1-2'`，
    `:22` 与 `:32` 两处断言要改；`:181` 的 `meta.engine` **不用改**。
19. **中文会话 id 不能进 URL**（Task 8）。
    supertest 底层是 superagent，遇到未转义的非 ASCII 路径会抛
    `TypeError: Request path contains unescaped characters` ——
    **测的就不是 404 逻辑，而是 superagent 自己炸了**。
    假 id 用纯 ASCII（`no-such-session`）。
    （`POST` 的**请求体**里放中文没问题，只有 URL 路径不行。）
20. **断言要看真实错误文案**（Task 8）。
    `normalizeInput` 对非法年份给的是 `year 必须是 1900–2100 之间的整数`，
    **不含「年」字**。断言 `toMatch(/年/)` 必然失败 ——
    要断言 `toMatch(/year/)`。先跑一遍看真实文案，再写断言。
21. **前端脚本要包 IIFE**（Task 10）。
    `chart.html` 同时加载 `app.js` 与 `result.js`，两个普通 `<script>` 共享全局作用域：
    - 后加载的 `result.js` 若在顶层声明 `function renderChart`，
      会**覆盖** app.js 的同名全局 ⇒ app.js 里那句
      `getElementById('chartSection').classList.remove('hidden')` 再也不执行；
    - 顶层 `const sessionId` 这类**词法声明**与别的脚本重名时，
      浏览器直接抛 `SyntaxError: Identifier 'sessionId' has already been declared`，
      **整页白屏**。
    ⇒ `result.js` 与 `chat.js` 全部包进 `(function () { … })();`，一个全局都不露。
22. **grep 校验构建产物要用 `-F`**（Task 10 Step 10b）。
    Tailwind 构建产物是 minify 过的，特殊字符被转义：
    `max-w-[85%]` → `.max-w-\[85\%\]`，`md:grid-cols-4` → `.md\:grid-cols-4`。
    普通 `grep -c "max-w-\\\[85"` 报 `grep: Unmatched [` ——
    **命令本身报错，看起来像「类没生成」，其实是命令写错了**。
    用 `grep -cF 'max-w-\[85'`。
23. **`app.js` 的 `renderChart` 有全局副作用**（Task 10）。
    它第一行就 `document.getElementById('chartSection').classList.remove('hidden')`。
    任何页面只要调它，就必须有 `#chartSection` 这个容器，否则 TypeError。
    `chart.html` 必须留它（即使 `result.js` 的 IIFE 版本会先转调 app.js 的版本）。
24. **同一份键序串在文件里只能有一种排版**（Task 2）。
    「输出规范」段的推进顺序与「Interpretation」段的键序串是**同一串**，
    必须逐字相同（含是否折行）。
    若一处折行一处不折行，下次改契约时很容易只改到一处 ⇒ 模型运行期看到两套键序。
25. **Task 9 Step 4 是「改」不是「写」**。
    `session.js` 末尾要追加 `module.exports.SESSIONS = SESSIONS;`、
    `app.js` 要加两行 `require` 与三行 `app.use` + `app.locals.sessions = ...`。
    漏了追加 ⇒ chat 路由拿不到会话表 ⇒ `/api/chat` 对任何 id 都返回 404，
    而 `/api/session/:id/history` 照样 200 —— **症状是「chat 路由 404」，
    根因却是会话表没共享**。
26. **「逐字拷贝」的测试文件里可能藏着解读层的断言**（Task 1）。
    v2 的 `input-validation.test.js` 有 **19 条断言打的是 `/api/interpret`** ——
    而 Task 1 Step 1b 恰好把那个路由摘了。**原样拷过来跑，实测 19 failed / 17 passed**，
    「10 个测试文件全绿」不成立。
    该文件顶部还有 `jest.mock('../src/llm/client', …)`，而 `client.js` 要到 Task 6 才拷 ——
    不处理就 `Cannot find module '../src/llm/client'`，**测试文件根本加载不了**。
    ⇒ Task 1 Step 2b 把它改写成只测 `/api/paipan` 的 17 条（**已实测 17/17 绿**，
    Task 1 结束时 10 个文件 / 265 个测试全绿）。
    **教训**：「逐字拷贝」之前先 grep 一遍那个测试文件里有没有已删功能的路由名。
27. **「两个路由校验等价性」的基线要跟着换**（Task 1 / Task 8）。
    v2 的基线是 paipan vs interpret；本产品没有 interpret 路由，
    基线换成 **paipan vs session**（两条都走 `normalizeInput`，`errors` 必须逐字相等）。
    Task 1 阶段 `/api/session` 还不存在，所以等价性断言放在 **Task 8**。
    **别把这条测试整个丢掉** —— 它验的是两条路由共用同一个校验器。
28. **Task 1 的 mkdir 要建全子目录**。
    `backend/src/llm`（Task 6 要 cp `client.js` 进去）与 `backend/src/career`
    （Task 3/4/5 要写文件进去）在 Task 1 的 `mkdir` 清单里**漏了**。
    `cp` 不会自动建目录 —— 实测报 `cp: cannot create regular file
    'backend/src/llm/client.js': No such file or directory`，**整条命令退出码 1**，
    后面跟着的 `&&` 一串都不执行。
29. **正则解析 markdown 前必须归一化行尾**（Task 3）。
    本机 git 的 `core.autocrlf=true` 会把入库的 LF **检出成 CRLF**。
    `schema.js` 里的枚举表格正则按 `\n|` / `\n\n` 定位，**对行尾敏感** ——
    新克隆的仓库里 `require('../src/career/schema')` 直接抛错，
    **契约层整体不可用**（而且只在**新克隆**时炸，本机工作树里看不出来）。
    ⇒ 解析前先 `text.replace(/\r\n/g, '\n')`；校验器比较两侧也各自归一化。
    **实测**：在 `/tmp` 做全新 clone 复验过。
    > 治根要加 `.gitattributes`（`* text=auto eol=lf`），但那会改动所有文件的检出行为，
    > 超出单任务范围 —— 收尾时统一处理。

