# 周易之易 · 事业推盘 + 事业问答

把 `zhouyi_seg1_v2` 的**离线排盘引擎**与 `zhouyi_seg2` 的**事业择业 skill 知识库**
整合成一个单页 Web 产品：输入出生信息，先离线排盘，再用 LLM 做事业择业推理，
最后可以就命盘继续问答。

## 它做什么

1. **输入页**填出生信息 → 点【提交】
2. 后台跑两个阶段：
   - **阶段一**：离线排盘（**零 LLM 调用、不联网**），产出 12 字段命盘 JSON
   - **阶段二**：五个事业择业 skill + 命盘 → 结构化事业推理 JSON（13 键）→ 渲染成散文文档
3. 算完后【开始聊天】按钮可点 → 进聊天页问事业问题
4. 聊天页有两个按钮，**开新 tab** 显示两个阶段的结果，供人工勘验

> **只有阶段二与阶段三（问答）会调 LLM。** 阶段一的排盘完全离线。

## 快速开始

```bash
npm --prefix backend install
cd backend && cp .env.example .env      # 填 MINIMAX_API_KEY
npm --prefix backend start
```

打开 http://localhost:3000

（根目录也可以用聚合脚本：`npm run install:all` / `npm start`。）

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `MINIMAX_API_KEY` | 是 | 无 | MiniMax 的 API Key，只从环境变量读，不进 Git |
| `MINIMAX_MODEL` | 否 | `MiniMax-M3` | 调用的模型名 |
| `MINIMAX_THINKING` | 否 | `disabled` | 深度思考开关；开启会吃掉 max_tokens 预算，把 JSON 截断 |
| `MINIMAX_MAX_TOKENS` | 否 | `32768` | 单次响应上限。阶段二输出约 4k 字符，默认值够用 |
| `MINIMAX_MAX_ATTEMPTS` | 否 | `3` | 客户端内部对网络类错误的重试次数 |
| `MINIMAX_TIMEOUT_MS` | 否 | `300000` | 单次请求超时（毫秒） |
| `MINIMAX_CAREER_ROUNDS` | 否 | `3` | 阶段二契约层重试轮数 |
| `PORT` | 否 | `3000` | 监听端口 |

`backend/.env` **不进 Git**（已在 `.gitignore` 里），只在本地放一份。
上面这张表与 `backend/.env.example` 逐项对齐。

## 前端页面

| 页面 | 路径 | 作用 |
|---|---|---|
| 输入页 | `/index.html` | 填出生信息 → 【提交】→ 【开始聊天】 |
| 聊天页 | `/chat.html?session=<id>` | 问事业问题；两个按钮开新 tab 勘验 |
| 排盘勘验页 | `/chart.html?session=<id>` | 阶段一命盘 JSON 的渲染结果 |
| 事业勘验页 | `/career.html?session=<id>` | 阶段二的结构化 JSON + 散文 |

## 测试

```bash
npm --prefix backend test                          # 全部单元测试（jest）
npm run smoke:e2e                                  # 端到端冒烟（注入假 LLM，不花 token、不联网）
npm --prefix backend run smoke:frontend            # 前端冒烟
npm --prefix backend run validate:schema           # 契约生成物与源一致
```

冒烟脚本也可以直接跑：

```bash
cd backend && node scripts/smoke-e2e.js
```

`npm run smoke:e2e` 走的是**假 LLM**（在 `client.callMiniMax` 上打桩），
跑通「提交 → 轮询 → 取命盘 → 取事业推理 → 问一句话 → 查历史」全链路，
**不需要 `MINIMAX_API_KEY`**，也不产生任何 token 费用。

变异验证（把被测模块的源码复制到仓库外再跑原封不动的测试，看哪些断言变红）：

```bash
cd backend && node scripts/mutation-check.js render
cd backend && node scripts/mutation-check.js run
cd backend && node scripts/mutation-check.js session
cd backend && node scripts/mutation-check.js app
cd backend && node scripts/mutation-check.js chat
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
| `backend/public/` | 四个前端页面 |
| `backend/skills/bazi-tuipan/` | 基线排盘 skill（**21 个**）+ 事业择业 skill（**5 个**：4 个子 skill + 总入口 `shiye-master`） |

> skill 数量的数法：`backend/skills/bazi-tuipan/` 下共有 25 个子目录，
> 去掉 `candidates/` 与 `rejected/`（不是 skill）⇒ **23 个 skill 目录**；
> 其中 5 个是事业择业 skill（`geshi-shiye` / `shiye-master` / `suiyun-shiye` /
> `tiaohou-shiye` / `wuxing-shiye`）⇒ **18 个基线排盘 skill 目录**；
> 另有 3 个基线 `.skill.md` 文件（`tuipan-master.skill.md` /
> `xi-ji-quyong.skill.md` / `八字完整推盘输出通用规范.skill.md`）
> ⇒ 基线合计 **21 个**；事业择业 **5 个**。

## 契约

顶层 13 键，顺序即输出顺序：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

`docs/CAREER_SCHEMA.md` 是**唯一手写源**；注入 prompt 的
`backend/prompts/CAREER_SCHEMA.md` 由 `npm run build:schema` 生成。
**改契约改源文件，然后重新生成并跑 `npm run validate:schema`。**

## 接口契约

```
POST /api/session          → 202 { success, sessionId, status:'pending', chart } | 400 {success:false, errors:[...]}
GET  /api/session/:id/status → 200 { success, sessionId, status:'pending'|'ready'|'error', error? } | 404
GET  /api/session/:id/chart  → 200 { success, chart } | 404
GET  /api/session/:id/career → 200 { success, career:{json, prose} } | 404
POST /api/chat             → 200 { success, answer } | 400 | 404 | 409 | 500
```

错误响应一律 `{ success:false, errors:[...] }`。**404 有三种文案**，按场景区分：

| 场景 | 文案 |
|---|---|
| 会话不存在或已过期（四个 `/api/session/:id/*` 路由与 `/api/chat` 共用） | `会话不存在或已过期` |
| 会话还在算阶段二（`GET /:id/career`） | `事业推理尚未完成` |
| 会话还在算阶段二（`POST /api/chat` 返回 409） | `事业推理尚未完成，请稍后再问` |

此外 `GET /:id/career` 在**阶段二失败**（会话 `status='error'`）时也返回 404，
但文案是 `session.error` 本身（例如 `大模型返回的事业推理结果不完整，请稍后重试`），
不是上面两句里的任何一句。前端 `result.js` 按 404 的文案分流 ⇒ **这些文案逐字不能改**。

## 部署约束

- **部署包必须包含仓库根的 `docs/` 目录**（即 `docs/CAREER_SCHEMA.md`）。
  阶段二的 13 键契约常量在运行时从**这个文件**解析（`backend/prompts/CAREER_SCHEMA.md`
  只是它的生成物，不能拿来兜底，否则契约源与生成物会静默分叉）。
  只打包 `backend/` 目录 ⇒ 进程启动即崩，错误文案会明确提示
  「契约源文件缺失：找不到 …/docs/CAREER_SCHEMA.md」。
- 长请求会被边缘代理中断 ⇒ 阶段二**必须**异步 + 轮询（本设计已满足）。
- `backend/.env` 不进 Git；`MINIMAX_API_KEY` 只从环境变量读。
- 模型：`MINIMAX_MODEL` 默认 `MiniMax-M3`，`MINIMAX_THINKING` 默认 `disabled`
  （深度思考会吃掉 max_tokens 预算，把 JSON 截断）。
- 阶段二输出较长，`MINIMAX_MAX_TOKENS` 可能需要上调。
- 上下文实测：MiniMax-M3 上下文为 1M token（保证 512K 可用）；
  阶段二 prompt 约 70,580 字符、阶段三 system prompt 约 13,222 字符，
  都远在限内。阶段三的历史**不截断**（规格要求全量重发），
  超出 120,000 字符预算时后端会返回 400 并提示刷新页面开新会话（不调模型）。
