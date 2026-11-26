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
