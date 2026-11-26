# 事业推理 JSON Schema（自动生成，勿手改）

本文件由 `npm run build:schema` 从 `docs/CAREER_SCHEMA.md` 生成。
改契约请改源文件，然后重新生成并跑 `npm run validate:schema`。

顶层 13 个键，顺序即输出顺序：

```
case → monthCommand → pattern → patternTracks → careerPhases → tiaoHou → xiJi → boundaries → directions → playbooks → timeline → transition → summary
```

```json
{
  "type": "object",
  "required": [
    "case",
    "monthCommand",
    "pattern",
    "patternTracks",
    "careerPhases",
    "tiaoHou",
    "xiJi",
    "boundaries",
    "directions",
    "playbooks",
    "timeline",
    "transition",
    "summary"
  ],
  "properties": {
    "case": {
      "type": "object",
      "required": [
        "gender",
        "pillars"
      ],
      "properties": {
        "gender": {
          "type": "string"
        },
        "pillars": {
          "type": "object",
          "required": [
            "year",
            "month",
            "day",
            "hour"
          ],
          "properties": {
            "year": {
              "type": "string"
            },
            "month": {
              "type": "string"
            },
            "day": {
              "type": "string"
            },
            "hour": {
              "type": "string"
            }
          }
        }
      }
    },
    "monthCommand": {
      "type": "object",
      "required": [
        "monthBranch",
        "dayMaster",
        "seasonClimate",
        "verdict"
      ],
      "properties": {
        "monthBranch": {
          "type": "string"
        },
        "dayMaster": {
          "type": "string"
        },
        "seasonClimate": {
          "type": "string"
        },
        "verdict": {
          "type": "string"
        }
      }
    },
    "pattern": {
      "type": "object",
      "required": [
        "type",
        "verdict",
        "storeHouse",
        "reasoning"
      ],
      "properties": {
        "type": {
          "type": "string"
        },
        "verdict": {
          "type": "string",
          "enum": [
            "成格",
            "破格",
            "不清"
          ]
        },
        "storeHouse": {
          "type": "string"
        },
        "reasoning": {
          "type": "string"
        }
      }
    },
    "patternTracks": {
      "type": "object",
      "required": [
        "byPattern",
        "byCombination"
      ],
      "properties": {
        "byPattern": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "pattern",
              "tracks",
              "trait",
              "note"
            ],
            "properties": {
              "pattern": {
                "type": "string"
              },
              "tracks": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "trait": {
                "type": "string"
              },
              "note": {
                "type": "string"
              }
            }
          }
        },
        "byCombination": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "tracks",
              "condition"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "tracks": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "condition": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "careerPhases": {
      "type": "object",
      "required": [
        "early",
        "later"
      ],
      "properties": {
        "early": {
          "type": "string",
          "minLength": 1
        },
        "later": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "tiaoHou": {
      "type": "object",
      "required": [
        "climateType",
        "primaryDrug",
        "secondaryDrug",
        "drugStatus",
        "drugReasoning",
        "gap"
      ],
      "properties": {
        "climateType": {
          "type": "string",
          "enum": [
            "寒局",
            "燥热局",
            "湿重局",
            "燥硬局",
            "春木旺局",
            "秋金肃局"
          ]
        },
        "primaryDrug": {
          "type": "string"
        },
        "secondaryDrug": {
          "type": "string"
        },
        "drugStatus": {
          "type": "string",
          "enum": [
            "真药",
            "藏药",
            "假药"
          ]
        },
        "drugReasoning": {
          "type": "string"
        },
        "gap": {
          "type": "string"
        }
      }
    },
    "xiJi": {
      "type": "object",
      "required": [
        "xi",
        "ciXi",
        "ji"
      ],
      "properties": {
        "xi": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        },
        "ciXi": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "ji": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        }
      }
    },
    "boundaries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "element",
          "why",
          "condition"
        ],
        "properties": {
          "element": {
            "type": "string"
          },
          "why": {
            "type": "string"
          },
          "condition": {
            "type": "string"
          }
        }
      }
    },
    "directions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "element",
          "direction",
          "coreImage",
          "careers",
          "personality",
          "note"
        ],
        "properties": {
          "element": {
            "type": "string"
          },
          "direction": {
            "type": "string"
          },
          "coreImage": {
            "type": "string"
          },
          "careers": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1
          },
          "personality": {
            "type": "string"
          },
          "note": {
            "type": "string"
          }
        }
      }
    },
    "playbooks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "scale",
          "condition",
          "actions"
        ],
        "properties": {
          "scale": {
            "type": "string",
            "enum": [
              "早期",
              "轻创业",
              "重资产",
              "合伙"
            ]
          },
          "condition": {
            "type": "string"
          },
          "actions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1
          }
        }
      }
    },
    "timeline": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "ganZhi",
          "type",
          "verdict",
          "mainTrack",
          "playbook",
          "liunianWindows"
        ],
        "properties": {
          "ganZhi": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "水运",
              "木运",
              "火运",
              "土运",
              "金运"
            ]
          },
          "verdict": {
            "type": "string",
            "enum": [
              "重仓",
              "轻试",
              "守成"
            ]
          },
          "mainTrack": {
            "type": "string"
          },
          "playbook": {
            "type": "string"
          },
          "liunianWindows": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "year",
                "signal",
                "action"
              ],
              "properties": {
                "year": {
                  "type": "integer"
                },
                "signal": {
                  "type": "string"
                },
                "action": {
                  "type": "string",
                  "enum": [
                    "宜",
                    "忌"
                  ]
                }
              }
            }
          }
        }
      }
    },
    "transition": {
      "type": "object",
      "required": [
        "risk",
        "advice"
      ],
      "properties": {
        "risk": {
          "type": "string"
        },
        "advice": {
          "type": "string"
        }
      }
    },
    "summary": {
      "type": "object",
      "required": [
        "strategy",
        "notes"
      ],
      "properties": {
        "strategy": {
          "type": "string",
          "enum": [
            "主业重仓",
            "底盘待机",
            "守成缓投"
          ]
        },
        "notes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        }
      }
    }
  }
}
```
