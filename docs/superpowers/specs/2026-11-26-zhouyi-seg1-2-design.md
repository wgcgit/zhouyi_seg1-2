# zhouyi_seg1-2 设计规格：周易之易 · 事业推盘 + 事业问答

> 日期：2026-11-26
> 状态：待用户批准
> 上游来源：`zhouyi_seg1_v2`（离线排盘引擎）、`zhouyi_seg2`（事业择业 skill 知识库）
> 原始资料：`zhouyi_seg1-2/参考资料/`（5 份 txt）

---

## 1. 目标

把两个既有项目整合成一个**单页产品**：

- **阶段一**：用户输入八字 → 离线排盘 → 命盘 JSON（复用 `zhouyi_seg1_v2` 的排盘引擎）
- **阶段二**：命盘 JSON + 事业择业知识 → 结构化事业推理结果（JSON）→ 渲染成散文文档
- **阶段三**：用户就事业问题自由提问，LLM 基于「本命推理结果 + 通用方法论」回答

成功标准：

1. 输入页填完信息点【提交】，后台跑完阶段一 + 阶段二后，【开始聊天】可点。
2. 聊天页能基于本命事业推理结果回答事业问题（行业、方位、打法、时机）。
3. 聊天页两个按钮「八字排盘结果」「事业推理结果」分别在新 tab 打开两阶段的完整结果，供人工勘验。
4. 阶段二的 JSON 严格符合契约（键序、必填、闭合枚举可机器校验），散文文档与 JSON 内容一致。

## 2. 非目标（本期明确不做）

- **不移植 `zhouyi_seg1_v2` 的解读层**。v2 只贡献**离线排盘**能力；它的 `routes/interpret.js`、`llm/client.js` 里的解读 Schema 校验、10 段解读（性格/婚姻/健康…）、`prompts/INTERPRET_PROMPT.md`、`prompts/INTERPRET_SCHEMA.md` 全部不参与本产品。本产品的解读层只有「事业」一块。
- 不做多用户、不做账号、不做历史记录持久化（会话只在内存，与 v2 的 JOBS 表一致）。
- 不做 Web 之外的客户端。
- 不做流式输出（chat 用一次性返回，见 §5.3）。
- 不做五行→行业的**程序化**映射表（方位/行业/赛道仍由 LLM 依 skill 知识产出，schema 只承载结果）。

## 3. 产品形态与页面流

```
┌─────────────────────────────────────────────┐
│ 输入页  index.html                          │
│   姓名/性别/出生日期时间/省市/流派开关       │
│   [提交]  [开始聊天]   ← 开始聊天初始 disabled │
└──────────────┬──────────────────────────────┘
               │ 点【提交】
               ▼
        后台任务（POST /api/session → 202）
        ├─ 阶段一：离线排盘（同步，毫秒级）
        └─ 阶段二：LLM 出事业推理 JSON → 渲染散文
               │
        轮询 GET /api/session/:id/status
               │ status === 'ready'
               ▼
        【开始聊天】按钮 enabled + 友好提示
               │ 点击
               ▼
┌─────────────────────────────────────────────┐
│ 聊天页  chat.html                           │
│   消息流 + 输入框 + 发送                     │
│   [八字排盘结果] [事业推理结果]  ← 开新 tab  │
└─────────────────────────────────────────────┘
        │                          │
        │ 新 tab                   │ 新 tab
        ▼                          ▼
  chart.html?session=...     career.html?session=...
  （阶段一命盘全表）          （阶段二 JSON + 散文）
```

**按钮语义（用户已定）**：
- 输入页有【提交】与【开始聊天】两个按钮。
- 点【提交】→ 跑阶段一 + 阶段二。**【开始聊天】置灰**，并给友好提示（如「正在推事业结果，约需 30 秒…」）。
- 后台完成后【开始聊天】恢复可点。
- 点【开始聊天】→ 进入聊天页，开始对话。

**聊天页的两个勘验按钮**：点击后用 `window.open` 开新 tab，分别显示阶段一命盘与阶段二事业推理结果。**这两个按钮不参与 chat 上下文**，纯供人工核对。

## 4. 仓结构

```
zhouyi_seg1-2/
├── 参考资料/                                   # 5 份原始 txt，逐字不可改
├── docs/
│   ├── CAREER_SCHEMA.md                        # 事业推理 JSON 契约（对齐《事业推理结果.txt》）
│   ├── CAREER_SCHEMA.sample.json               # 基准用例期望输出（戊辰 己未 乙亥 乙酉 男命）
│   └── superpowers/
│       ├── specs/2026-11-26-zhouyi-seg1-2-design.md   # 本文件
│       └── plans/2026-11-26-zhouyi-seg1-2-plan.md     # 实施计划（下一步写）
├── backend/
│   ├── src/
│   │   ├── calendar/  core/  analyze/  fortune/  geo/  chart/   # ← 从 v2 逐字拷贝
│   │   ├── llm/
│   │   │   ├── client.js                       # ← 从 v2 拷贝，删掉解读层校验，只留 callMiniMax/parseLLMJson
│   │   │   └── prompt.js                       # ← 新写：组装排盘+事业两套 system prompt
│   │   ├── career/
│   │   │   ├── schema.js                       # 契约常量（键序、枚举、必填）
│   │   │   ├── validate.js                     # JSON 契约校验器
│   │   │   └── render.js                       # JSON → 散文文档渲染器
│   │   └── routes/
│   │       ├── paipan.js                       # ← 从 v2 拷贝
│   │       ├── normalize-input.js              # ← 从 v2 拷贝
│   │       ├── error-text.js                   # ← 从 v2 拷贝
│   │       ├── session.js                      # 新写：阶段一 + 阶段二编排
│   │       └── chat.js                         # 新写：阶段三问答
│   ├── prompts/
│   │   ├── CAREER_PROMPT.md                    # 事业推理合同（行为约束 + 字段指引）
│   │   └── CAREER_SCHEMA.md                    # 注入 prompt 的 JSON Schema（机器可读）
│   ├── skills/bazi-tuipan/                     # ← 从 v2 拷贝 16 个 + 从 seg2 拷贝 5 个事业 skill
│   ├── public/
│   │   ├── index.html  chat.html  chart.html  career.html
│   │   └── js/app.js  chat.js  result.js
│   └── tests/
└── package.json
```

**拷贝来源（逐字，不改一个字节）**：
- `zhouyi_seg1_v2/backend/src/{calendar,core,analyze,fortune,geo,chart}/` → 原样拷贝
- `zhouyi_seg1_v2/backend/src/routes/{paipan,normalize-input,error-text}.js` → 原样拷贝
- `zhouyi_seg1_v2/backend/src/llm/client.js` → 拷贝后**删掉解读层专有部分**（`REQUIRED_INTERPRET_KEYS` / `REQUIRED_INTERPRET_FIELDS` / `INTERPRET_ARRAY_SPECS` / `interpretDefects` / `validateInterpret`），保留 `callMiniMax` / `parseLLMJson` / `friendlyError` / 括号容错解析
- `zhouyi_seg1_v2/backend/skills/bazi-tuipan/` 16 个基线 skill → 原样拷贝
- `zhouyi_seg2/skills/bazi-tuipan/` 的 5 个事业 skill → 拷贝后**仅改写 `shiye-master.skill.md` 的三段**（见 §5.2.1），其余 4 个子 skill 原样拷贝

**唯一一处「拷贝后改写」：`shiye-master.skill.md`**（详见 §5.2.1）。seg2 **原仓一字不动**；本仓的副本与 seg2 基线不再逐字一致，须在 `docs/` 留一份 diff 说明（改了什么、为什么改）。

**不拷贝**：`zhouyi_seg1_v2/backend/src/routes/interpret.js`、`backend/prompts/INTERPRET_*.md`、`zhouyi_seg1_v2/backend/src/llm/prompt.js`（重写）、v2 的解读页前端。

## 5. 三个阶段的设计

### 5.1 阶段一：离线排盘

**完全复用 v2**，零改动。命盘 JSON 仍是 12 个顶层字段（`meta, input, settings, pillars, dayMaster, derived, interactions, shensha, strength, pattern, fortune, lunar`）。

**离线层不动的三条硬约束**（沿用 v2 的 Global Constraints #10）：
- `strength.dayMasterStrength` 恒 `null`
- `strength.usefulGod` 恒 `null`
- `pattern.finalPattern` 恒 `null`

**理由与代价**（已核实）：事业决策链必须要喜用神/忌神/成格破格才有输出，而离线层这三项**恒为 null**（流派分歧大，离线层不拍板）。因此：

> **阶段二 LLM 必须基于 `strength.factors`（得令/得地/得势/得生）、`strength.elementScores`、`strength.tendency`、`pattern.candidates[]`（含 `confidence` 与 `reason`）自行判断身强弱、用神、忌神与格局成败。**

这与 v2 解读层已有的先例一致（`INTERPRET_PROMPT.md:13-19`「这三项由你在解读时给出判断」）。**本产品不破这条约束，也不给离线层新增调候计算**（用户已定：调候由 LLM 自行判定）。

**已知缺口（接受）**：全仓 grep `节气/调候/climateType` 零命中，`pattern` 层无「财库」识别。所以 `tiaoHou.climateType` 与 `pattern.storeHouse` 的判定完全靠 LLM 依 `事业3.txt`/`事业2.txt` 的知识推断，依据是月令 + 藏干 + 五行分数。

### 5.2 阶段二：事业推理

#### 5.2.1 输入

- **命盘 JSON**（阶段一输出，全量）——唯一接口，不重排四柱
- **事业择业知识**（来自 5 个 skill）：

| skill | 落盘位置 | 取哪段 |
|---|---|---|
| `tiaohou-shiye/SKILL.md` | `backend/skills/bazi-tuipan/` | `## Interpretation（核心方法论）` |
| `geshi-shiye/SKILL.md` | 同上 | 同上 |
| `wuxing-shiye/SKILL.md` | 同上 | 同上 |
| `suiyun-shiye/SKILL.md` | 同上 | 同上 |
| `shiye-master.skill.md` | 同上（顶层文件） | `## 输出规范` + `## Interpretation（核心方法论）` + `## Execution` |

**与 v2 `extractInterpretation()` 的差异（重要）**：

v2 的 `extractInterpretation()` 只取 `## Interpretation` 到下一个 `## ` 之间。但 `shiye-master.skill.md` 的段序是：

| 行 | 段 | 实测长度 |
|---|---|---|
| `:9` | `## 输出规范（固化在此文件，必须严格遵守）` ← **在 Interpretation 之前** | 560 |
| `:30` | `## Interpretation（核心方法论）` | 2038 |
| `:100` | `## 子 Skill 清单` | 303 |
| `:111` | `## Execution（执行步骤）` | 1083 |
| `:136` | `## A2（Future Trigger）` | 98 |
| `:141` | `## Boundary（边界）` | 217 |

**只取 Interpretation 会丢掉三样契约性内容**：推进顺序、5 条硬性规则、10 步→10 键的落笔映射。

⇒ **本项目的 `prompt.js` 实现一个多段提取器**：对 `shiye-master.skill.md` 取 `输出规范` + `Interpretation` + `Execution` 三段；对其余 4 个子 skill 只取 `Interpretation`（它们的 A2/Execution 是流程指令，与契约冲突，不进 prompt）。

> 这不是「违反 seg2 的约束」——seg2 那条「运行时只加载 Interpretation 段」是为「接入 v2 的 prompt.js」这一具体场景设的。本项目自己写 prompt 组装器，故按本项目需要取段。

#### 5.2.1.1 `shiye-master.skill.md` 的改写（唯一一处拷贝后改动）

**问题**：`输出规范`、`Interpretation`、`Execution` 三段写死了 **10 键**，而本项目的契约是 **13 键**（§5.2.2）。若原样注入，模型会按 10 键输出，三个新键拿不到值，契约校验必挂。

**已核实的原文位置**：

| 位置 | 原文 | 问题 |
|---|---|---|
| `输出规范:15-19` | 推进顺序 `case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary` | 缺 3 个新键 |
| `输出规范:23` | 硬性规则 2：「顺序固定，**10 个顶层键**一个不少」 | 数字错 |
| **`Interpretation:43`** | 「**输出键序以 `docs/CAREER_SCHEMA.md` 为准**：`case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary`」 | **缺 3 个新键**（此行也会被注入 system prompt） |
| `Execution:111-135` | 10 步，逐步点名那 10 个键 | 缺 3 个新键的落笔步骤 |
| `Execution:135` | 产出校验：「逐条核对 `docs/CAREER_SCHEMA.md` 的 **10 个顶层键**是否齐全」 | 数字错 |

> **`Interpretation:43` 是实测补上的漏项。**
> 改写方案初稿只列了 `输出规范` 与 `Execution` 两段（5 处），漏了 `Interpretation` 段内的这一行 ——
> 但 `prompt.js` 的多段提取器**会把 `Interpretation` 整段注入 system prompt**，
> 模型运行期照样看得到 10 键的键序，与 13 键契约矛盾。
> 所以实际要改的是**三段**、共 **6 处**。

**改写方案（用户已定：拷贝后改写这三段）**：

1. **推进顺序**（`输出规范:15-19`）改为 13 键：
   ```
   case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
        → boundaries → directions → playbooks → timeline → transition → summary
   ```
2. **硬性规则 2**（`输出规范:23`）：「10 个顶层键」→「13 个顶层键」。
3. **`Execution` 插 3 步**（`Execution:111-135`），插入点严格对应新键序（键序是唯一权威）：
   - 原第 3 步（填 `pattern`）**之后**、原第 4 步之前：**定格局赛道** → 填 `patternTracks`
     （十格局的适合赛道 + 特质；经典配格有则填 `byCombination`，无则该数组留空）
   - 上一条**之后**、原第 4 步（填 `tiaoHou`）之前：**定人生阶段** → 填 `careerPhases`
     （早年阶段特征与表现、中年后阶段特征与表现；**这是综合判断，不是规则推导**）
   - 原第 6 步（填 `boundaries`）**之后**、原第 7 步之前：**定方位与行业** → 填 `directions`
     （按喜用五行给：核心象、代表职业、性格适配、方位参考）
   ⇒ 改写后的步序为：`case` → `monthCommand` → `pattern` → `patternTracks` → `careerPhases`
   → `tiaoHou` → `xiJi` → `boundaries` → `directions` → `playbooks` → `timeline` → `transition` → `summary`，
   与 §5.2.2 的键序、§5.2.3 的对齐表**三处必须逐字一致**。
4. **产出校验**（`Execution:135`）：「10 个顶层键」→「13 个」。
5. 原 10 步的编号相应顺延，总步数 10 → 13。
6. **`Interpretation:43` 的键序串**改为与第 1 条**逐字相同**的 13 键串。

**`## Boundary` 段**（`:141`，217 字符）**不取**：内容是「不重排四柱、不重算旺衰喜忌」，这类约束改由 `CAREER_PROMPT.md` 以本项目的措辞表达。

**改动的可追溯性**：seg2 原仓不动；本仓留 `docs/SHIYE_MASTER_DIFF.md` 记录上述 **6 处**改写的前后对照与理由。

**改写后的注入长度预估**：`输出规范` ~620 + `Interpretation` 2038 + `Execution` ~1400 ≈ **4058 字符**。

#### 5.2.2 输出契约（对齐《事业推理结果.txt》）

**对齐基准（用户已定）**：`《事业推理结果.txt》` 作**骨架**（段落顺序 + 叙述粒度），并补齐 `事业1/3/4` 中 txt 未覆盖的知识。

**实测事实**：`《事业推理结果.txt》` 是**旗舰样例**而非方法论全集 —— 它的 17 个非空行对应 8 个语义段；其中「事业阶段」段在 `事业1~4.txt` 里**零出处**（属综合产物）；而 txt **未覆盖**的资料知识有：流年窗口（事业4）、五行方位/代表职业/复合行业（事业1）、十格局→赛道与七组配格（事业2）、调候→赛道（事业3）。

**顶层键序（13 个，比 seg2 的 10 个多 3 个）**：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi
     → boundaries → directions → playbooks → timeline → transition → summary
```

与 seg2 的 10 键相比：**新增 `patternTracks` / `careerPhases` / `directions`**；其余 10 键的键序、字段、枚举全部不变。

#### 5.2.3 逐段对齐表

**排序基准 = §5.2.2 的键序**（不是 txt 行号）。txt 里没有对应位置的键标「—（txt 无）」。

| 序 | schema 键 | txt 行 | txt 内容 | 说明 |
|---|---|---|---|---|
| 1 | `case` | L1-2 | 标题 + 四柱 | 原样 |
| 2 | `monthCommand` + `pattern` | L4 | 「月令未月：季夏燥土，财星当令；辰为水库财库…财多身难独担」 | **txt 合并成一段，schema 分两键**。渲染时并成一段输出（见 §5.2.6） |
| 3 | `patternTracks` | —（txt 无） | — | **新增键**，承载 `事业2.txt` 的十格局→赛道 + 七组配格行业定向 |
| 4 | `careerPhases` | L5 | 「事业阶段：早年财杀混杂，多奔波、多试错、换赛道、平台辗转；中年后若大运引水印…」 | **新增键**。字段 `{ early: string, later: string }` |
| 5 | `tiaoHou` | L7 | 「未月季夏，乙木枯燥，调候第一要癸水润局，次要丙火阳光…原局无丙透」 | 原样 |
| 6 | `xiJi.{xi,ciXi,ji}` | L9-10 | 「喜：水（印）、木（比劫）…次喜丙火…忌：叠土、叠金」 | 原样 |
| 7 | `boundaries` | L11 | 「不是不能碰土金赛道：…」 | 原样 |
| 8 | `directions` | —（txt 无） | — | **新增键**，承载 `事业1.txt` 的五行→方位 + 代表职业 + 复合行业 |
| 9 | `playbooks` | L13-16 | 「早年、一般运 / 轻创业 / 重资产操盘 / 合伙」 | 原样，4 档齐全 |
| 10 | `timeline[]` | L17-20 | 「水运（亥、子）/木运（寅、卯）/火运（巳、午）/厚土、叠金运」 | **粒度差异，见下** |
| 11 | `transition` | L21 | 「交运过渡：藤萝根基未稳…」 | 原样 |
| 12 | `summary` | —（txt 无总纲段） | — | **保留**。渲染为散文末尾的「策略总纲」段 —— 属**已知偏离基准**（散文比 txt 多一节） |

**`timeline` 的粒度冲突与处置**：

- **txt 侧**：按**五行类型分组**叙述（`水运（亥、子）` 括注地支集；「厚土、叠金运」把土金并成一段）。
- **schema 侧**：`timeline[]` 每条 = **一步大运**，`ganZhi` 填单步干支，`type` 填五行口径。seg2 的 master `:68-77`「契约落笔口径」明确要求「每步大运各占一条记录…「水运（亥、子）」是**五行分组**，逐步拆开、各填各的干支」。
- **处置**：**schema 保持单步大运不变**（这是 seg2 校验器钉死的语义，改了会破坏其契约）；**渲染器**在出散文时按 `type` 归并相邻同五行的大运，输出成 txt 那样的五行分组段。括号里的地支集（亥子/寅卯/巳午/辰戌丑未/申酉）由渲染器内置映射表提供。
- **txt 把「土运」与「金运」并成一段**：schema 的 `type` 是 5 个独立枚举。渲染时若同一命局同时出现土运与金运且两者 `verdict` 相同，渲染器可合并为「厚土、叠金运」；否则分列。**这是渲染层的启发式，不是契约层的约束。**

**新增键的字段设计**：

```jsonc
// patternTracks —— 格局 → 赛道（来自 事业2.txt）
"patternTracks": {
  "byPattern": [ { "pattern": "财格", "tracks": ["不动产长期持有", "…"], "trait": "…", "note": "…" } ],
  "byCombination": [ { "name": "财生官格", "tracks": ["地产项目管理", "…"], "condition": "…" } ]
}

// careerPhases —— 人生阶段（对齐 txt L5）
"careerPhases": {
  "early": "早年财杀混杂，多奔波、多试错、换赛道、平台辗转",
  "later": "中年后若大运引水印、中年以后家资成就"
}

// directions —— 五行 → 方位与行业（来自 事业1.txt）
"directions": [
  { "element": "水", "direction": "北", "coreImage": "流转、变通、智慧",
    "careers": ["跨境贸易", "…"], "personality": "…", "note": "…" }
]
```

`directions` 的 `element` 取值来自 `xiJi.xi`（喜用五行），不是全部五行 —— 只给喜用的方向，忌神方向由 `boundaries` 表达。

#### 5.2.4 闭合枚举（在 seg2 的 8 组基础上不动）

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

**两处 `verdict` 枚举不可混用**（`pattern.verdict` 说的是格局成败，`timeline[].verdict` 说的是该运的策略）—— 在 `CAREER_PROMPT.md` 里显式写死。

**新增键不引入新枚举**：`patternTracks.byPattern[].pattern`、`directions[].element` 用开放字符串（模型可写「正财格」「偏财格」等）。

#### 5.2.5 必填与可空

沿用 seg2 的 8 个必非空数组，另加：

| 数组 | 必非空 | 理由 |
|---|---|---|
| `patternTracks.byPattern` | ✅ | 本命总有一个格局 |
| `patternTracks.byCombination` | ❌ 可空 | 不是所有命都构成经典配格 |
| `directions` | ✅ | 喜用五行至少一个 |
| `careerPhases.early` / `.later` | 字符串**必填**（可为空串？不） | **必填非空** |

`xiJi.ciXi` 仍是**唯一可空数组**（次喜是加分项，不得为凑满而编造）。

**`tiaoHou.secondaryDrug` 口径（用户已定：以 txt 为准）**：
- 取值 = **丙火**（`事业推理结果.txt:7`「次要 丙火阳光」），**不取** `事业3.txt` 六大气机口径的「柔金」。
- 契约文档里必须写明这个选择及其来源行号，避免后续实现者按 seg2 的规则改回去。
- `CAREER_SCHEMA.sample.json` 的 `secondaryDrug` 相应改为 `"丙火"`（seg2 的 sample 里已是 `"丙火"`，与 txt 一致，无冲突）。

#### 5.2.6 渲染器：JSON → 散文文档

**输入**：符合契约的 JSON。**输出**：Markdown 散文，段落顺序与《事业推理结果.txt》一致。

渲染规则：

1. 段序 = 键序（§5.2.2），但 L4 对应的 `monthCommand` + `pattern` **合并成一段**输出（因为 txt 就是一段）。
2. `careerPhases` 渲染为「事业阶段：{early}；{later}」一段。
3. `patternTracks` 渲染为「格局赛道：…」段（**txt 无此段 —— 已知偏离**）。
4. `directions` 渲染为「方位与行业：…」段（**txt 无此段 —— 已知偏离**）。
5. `timeline` 按 `type` 归并相邻同五行的大运，输出「水运（亥、子）：…」形式的段。
6. `summary` 渲染为末尾「策略总纲：…」段（**txt 无此段 —— 已知偏离**）。
7. 所有值经 HTML 转义后插入（防 XSS），与 v2 前端 `esc()` 同一策略。

**散文文档与 txt 的已知差异（明示，非缺陷）**：
- 多 3 段（`patternTracks` / `directions` / `summary`）
- 少 1 项信息：txt 的 `timeline` 段不含流年窗口，但 schema 的 `timeline[].liunianWindows` 是必填非空 ⇒ 散文必然多出流年内容（**已知偏离**）
- `case` 段的四柱写法由 schema 的 `case.pillars` 决定，与 txt 的「戊辰年 己未月 乙亥日 乙酉时」格式一致

**渲染器必须可测**：给定 `CAREER_SCHEMA.sample.json`，渲染输出必须包含每一段、且不含原始 JSON 键名残留。

#### 5.2.7 校验

阶段二 LLM 的输出**必须过契约校验**才能进入渲染：

- 键序（13 键，顺序固定）
- 必填字段、类型
- 8 组闭合枚举
- 必非空数组 / `ciXi` 可空
- 四柱与阶段一命盘一致（沿用 v2 `interpret.js:150-162` 的判废逻辑，防模型改写四柱）

校验不通过 → 整轮重试（沿用 v2 `runRounds` 模式，默认 3 轮）。仍不通过 → 该次会话标记失败，聊天页显示中文错误。

### 5.3 阶段三：chat 问答

**上下文构成**（用户已定：推理结果 + skill 通用知识）：

```
system:
  ├─ 聊天合同（角色设定、回答风格、禁止重排四柱、禁止编造推算结果）
  ├─ 本命事业推理结果（JSON 全文 + 渲染后的散文）
  └─ 五行象义与代表职业（wuxing-shiye 的 Interpretation）+ 调候（tiaohou-shiye）
     + 格局（geshi-shiye）+ 岁运（suiyun-shiye）的 Interpretation
user:
  └─ 历史消息 + 本轮提问
```

**skill 段落的取舍**：4 个子 skill 的 `Interpretation` 全取（`wuxing-shiye` 是方位/行业的来源、`suiyun-shiye` 是时机的来源，都直接服务于提问）。`shiye-master.skill.md` **不取** —— 它是编排与落笔指令（面向阶段二），不是知识；阶段三的知识已在 4 个子 skill 里。

**历史管理**：会话内保存消息数组，随对话追加。多轮上下文**全部重发**（不做截断）—— 本产品的对话轮次预计不多，且事业推理结果本身较长，上下文压力主要来自那段固定内容。

**回答约束**（写进聊天合同）：
- 只依据本命推理结果与 skill 通用知识回答，不重排四柱、不重算旺衰喜忌
- 涉及具体大运/流年时，必须引用 `timeline` 里的原文，不要自己推
- 不确定时明说「这一点推理结果里没有直接结论」

**输出形式**：一次性返回（非流式）。后端 `POST /api/chat` → `{ success: true, answer: string }`。

### 5.4 会话与任务编排

**会话表**：内存 `Map`，键 `sessionId`，TTL 1 小时，进程重启即失效（与 v2 的 JOBS 表同款，v1/v2 一致）。

**接口**：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/session` | 提交八字。同步完成阶段一并返回 `{ sessionId, status, chart }`（202），阶段二在后台跑 |
| GET | `/api/session/:id/status` | 轮询。`{ status: 'pending'|'ready'|'error', career?, error? }` |
| GET | `/api/session/:id/chart` | 阶段一命盘 JSON（供新 tab 勘验） |
| GET | `/api/session/:id/career` | 阶段二结果 `{ json, prose }`（供新 tab 勘验） |
| POST | `/api/chat` | `{ sessionId, message }` → `{ answer }` |

**阶段一同步、阶段二异步**的理由：阶段一是毫秒级的纯计算，没理由让用户等；阶段二要调 LLM 出长文，必须异步。202 响应里**一并带回 chart**，前端立刻就能显示命盘。

**轮询**：前端每 2 秒轮询 `/api/session/:id/status`，与 v2 前端 `MAX_POLLS=60` / 2 秒间隔同款。阶段二可能耗时较长（LLM 出长文），超时上限设为 5 分钟。

**并发**：同一会话允许多次提交，以最后一次为准（旧会话的阶段二结果若晚到，只更新自己的 session，不影响新会话）。

## 6. 前端

| 页面 | 内容 |
|---|---|
| `index.html` | 输入表单（沿用 v2 的字段与默认值）+【提交】+【开始聊天】+ 状态提示区 |
| `chat.html` | 消息流 + 输入框 +【八字排盘结果】【事业推理结果】两个按钮 |
| `chart.html` | 阶段一命盘全表（沿用 v2 的 `renderChart` 系列函数） |
| `career.html` | 阶段二结果：上半 JSON（可折叠）、下半散文文档 |

**样式**：沿用 v2 的 Material 3 暖棕主题与本地构建的 Tailwind（v2 的 `tailwind.config.js` / `backend/public/css/` 逐字拷贝）。

**输入页的按钮状态机**：
- 初始：【提交】可点，【开始聊天】disabled
- 点【提交】→ 【提交】disabled，【开始聊天】disabled，提示「正在推事业结果…」
- 阶段一失败 → 提示中文错误，【提交】恢复可点
- 阶段二完成 → 【开始聊天】enabled，提示「事业结果已就绪」
- 阶段二失败 → 【开始聊天】保持 disabled，提示中文错误 +【提交】恢复可点（可重试）

**chat 页的会话上下文**：`sessionId` 通过 URL query 传递（`chat.html?session=xxx`），这样刷新页面能恢复会话，也方便把链接直接发给用户。

**勘验新 tab**：`window.open('/chart.html?session=xxx', '_blank')` 与 `window.open('/career.html?session=xxx', '_blank')`。两个页面自己调 API 拉数据，不依赖 opener。

## 7. 测试

**沿用 v2 的技术栈**：Jest + supertest（`backend/jest.config.js` 逐字拷贝）。

| 测试 | 断言 |
|---|---|
| `career-schema.test.js` | 契约常量自洽：13 键键序、8 组枚举、必填/可空标注与 `docs/CAREER_SCHEMA.md` 一致 |
| `career-validate.test.js` | 校验器：合法样例通过；缺键/错枚举/空必填数组/`ciXi` 空通过/`ciXi` 误设 minItems 报错；**两处 verdict 混用要报错**；**`CAREER_SCHEMA.sample.json` 自身通过契约校验**（原 `career-sample.test.js` 的覆盖并入本文件） |
| `career-render.test.js` | 用 `CAREER_SCHEMA.sample.json` 渲染：段序与 txt 一致；每个键都有对应段落；无 JSON 键名残留；`timeline` 按五行归并正确 |
| `session.test.js` | `POST /api/session` 202 + 带回 chart；轮询 pending→ready；四柱不一致时判废 |
| `chat.test.js` | mock LLM：上下文含推理结果与 skill 知识；回答原样返回；session 不存在时 404 |
| `api.test.js` | 拷自 v2，改动点：`/api/paipan/schema` 仍返回 12 字段；新增接口的 404 中文 |
| 离线引擎测试 | 逐字拷贝 v2 的 `analysis/calendar/derived/fortune/geo/pillars/shensha` 等测试；**`input-validation.test.js` 需改写** —— 它有 19 条断言打的是被摘掉的 `/api/interpret` 路由，且顶部 mock 了要到阶段二才存在的 `src/llm/client`；改写后只测 `/api/paipan` 的 16 条断言，其中「两路由校验等价性」一条移到 `session.test.js`，基线换成 **paipan vs session** |

**硬约束（沿用 v2）**：
- 新增/修改的断言**必须先红后绿**，不许靠调断言数值让测试变绿。
- 数字对不上时先报告实际数字，再修实现。

## 8. 配置与部署

- `MINIMAX_API_KEY` 只从环境变量读，`backend/.env` 进 `.gitignore`。
- 沿用 v2 的模型配置：`MINIMAX_MODEL` 默认 `MiniMax-M3`，`MINIMAX_THINKING` 默认 `disabled`，`MINIMAX_MAX_TOKENS` 默认 `32768`。
  - ⚠️ **阶段二输出比 v2 的 10 段解读长得多**（13 键 + 结构化数组 + 散文），`max_tokens` 可能需要上调；实施时以实测为准。
- `MINIMAX_CAREER_ROUNDS` 默认 3（契约校验不过时的整轮重试次数）。
- 部署目标：PocketBay（沿用 v1/v2 的部署方式）。⚠️ **平台有长请求限制**：阶段二必须异步 + 轮询，本设计已满足。
- npm 源用 `https://registry.npmmirror.com`（本机 GitHub/CDN 不可达）。

## 9. 已知约束与风险

| # | 约束/风险 | 说明与缓解 |
|---|---|---|
| 1 | **离线层三字段恒 null** | 喜用神/忌神/格局成败全靠 LLM 从 `factors`/`candidates` 自行判断。与 v2 解读层先例一致，但**准确率依赖模型**，无程序化兜底 |
| 2 | **调候无离线数据** | `climateType`/`primaryDrug`/`secondaryDrug` 全靠 LLM 依 `事业3.txt` 知识推断。用户已定接受此方案 |
| 3 | **财库无识别** | `pattern.storeHouse` 靠 LLM 从月令与藏干推断，v2 `src/` 全仓无财库查表 |
| 4 | **散文比 txt 多 4 处内容** | `patternTracks` / `directions` / `summary` 三段 + `timeline` 里的流年内容。属**用户已批准的「补齐资料」**，明示为已知偏离 |
| 5 | **阶段二耗时与 token 成本** | 一次 LLM 出 13 键 JSON + 渲染，可能需要更大 `max_tokens` 与更长超时。实施时实测调整 |
| 6 | **`shiye-master` 的多段提取** | 需自己写提取器取 3 段（`输出规范` + `Interpretation` + `Execution`），不能沿用 v2 的单段 `extractInterpretation()` |
| 7 | **上下文长度** | 阶段三每次重发「推理结果 + 4 个 skill Interpretation + 历史消息」。实测 4 个子 skill 的 Interpretation 段合计 **11618 字符**（tiaohou 2972 / geshi 2485 / suiyun 2394 / wuxing 1703），推理结果 JSON 约 1.2k 字符（`CAREER_SCHEMA.sample.json` 实测 1247）。需实测是否触顶，必要时只取 `wuxing-shiye` + `suiyun-shiye` 两段 |
| 8 | **会话只在内存** | 进程重启即失效。与 v2 的 JOBS 表同款，本期为可接受简化 |
| 9 | **`参考资料/` 与 skill 基线不可改** | 5 份 txt 与 16 个 v2 基线 skill 逐字不改；seg2 的 4 个子 skill 逐字不改。**唯一例外**：`shiye-master.skill.md` 的 3 段按 §5.2.1.1 改写（seg2 原仓不动，本仓留 diff 说明） |
| 10 | **GitHub 仓** | 仓名 `zhouyi_seg1-2`，由本对话创建并推送。⚠️ 本机 `github.com:443` 直连时通时不通（DNS 给的 IP 被墙），推之前先探连通性，不通就走本地 CONNECT 代理（见 [[github-connect-proxy-workaround]]） |
| 11 | **阶段二 prompt 体积** | 命盘 JSON 25.4k + 5 个 skill 的注入段 ~15.7k + 契约与合同 ≈ 40k+ 字符。需实测 MiniMax 的实际上下文上限；若触顶，先砍命盘 JSON 中与事业无关的段（`shensha` / `lunar` / `interactions` 的部分数组），**但 `strength` / `pattern` / `fortune` 三段必须保留**（喜忌、格局、岁运的依据全在这里） |

## 10. 决策落定（2026-11-26）

1. **契约文档单一源 + 生成**（用户已定）：`docs/CAREER_SCHEMA.md` 是**唯一手写源**（人读 + 内嵌机读 JSON Schema 块）；`backend/prompts/CAREER_SCHEMA.md`（注入 prompt 的那份）由**构建脚本从源生成**，不手工维护。避免 v2 那种「Schema md 与 `client.js` 常量两份手工同步」的漂移风险。
   - 生成脚本：`backend/scripts/build-career-schema.js`
   - 校验：`scripts/validate-skills.js`（从 seg2 移植并改造）**必须断言生成物与源一致**（生成物过期 ⇒ 报红）。
   - 校验器常量（13 键键序、8 组枚举、必填/可空标注）同样**从源解析**，不另写一份常量。
2. **`patternTracks.byCombination` 可空**（用户已接受）：不是所有命都构成经典配格，留空是合法的。
3. **GitHub 仓库名 `zhouyi_seg1-2`**，由本对话创建并推送。

## 11. 决策记录（2026-11-26，用户逐条拍板）

| # | 决策 | 影响到的章节 |
|---|---|---|
| 1 | 整合方式：v2 出排盘、seg2 出事业解读、chatbot 回答事业问题、两个新 tab 勘验 | §3 |
| 2 | 不移植 v2 的解读层 | §2、§4、§7 |
| 3 | 阶段二先输出 JSON，再渲染成散文文档 | §5.2.2、§5.2.6 |
| 4 | chat 上下文 = 推理结果 + skill 通用知识 | §5.3 |
| 5 | 输入页【提交】+【开始聊天】两按钮，后台算完才可点 | §3、§5.4、§6 |
| 6 | 调候层由 LLM 自行判定 | §5.1、§9 #2 |
| 7 | 契约对齐基准：txt 作骨架 + 补齐资料 | §5.2.2、§5.2.3 |
| 8 | 新增 4 键：`careerPhases` / `directions` / `patternTracks` / 保留 `summary` | §5.2.2、§5.2.3 |
| 9 | `tiaoHou.secondaryDrug` 以 txt 为准（丙火） | §5.2.5 |
| 10 | **`shiye-master` 的三段：拷贝后改写**（不违反 seg2 原仓） | §4、§5.2.1.1 |
| 11 | **仓库名 `zhouyi_seg1-2`** | GitHub 仓由本对话创建并推送 |
| 12 | **契约文档单一源 + 生成** | `docs/CAREER_SCHEMA.md` 唯一手写源，注入 prompt 的那份由脚本生成；校验器常量从源解析 |
