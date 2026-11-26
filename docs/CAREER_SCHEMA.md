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
