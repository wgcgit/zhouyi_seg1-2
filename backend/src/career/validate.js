'use strict';

const { MACHINE_SCHEMA, TOP_LEVEL_KEYS } = require('./schema');

/**
 * 缺陷消息的**路径约定**（全模块一致，不混用）：
 *
 *   顶层键 / 顶层键.嵌套键 / 顶层键.嵌套键[下标]
 *
 * 即：**一律不带根前缀**。路径部分从顶层键开始，例如
 *   `pattern.verdict: 值 "大吉" 不在枚举 [...] 内`
 *   `timeline[0].liunianWindows[0].action: 必填字段缺失`
 * 非路径类的整体性缺陷用固定中文标识开头（`整体` / `键序`），
 * 便于调用方一眼区分「某个字段错了」与「整份结果形状不对」。
 *
 * **有两条缺陷不是字段路径**：`整体:` 与 `键序:`。
 * 这两条是**整体性问题**（整份结果不是对象 / 顶层键的顺序不对），
 * 不是「某个字段错了」—— 调用方若要按路径解析缺陷来拼修复提示，
 * 遇到这两个前缀要单独处理，别当成字段路径去截取。
 *
 * **顶层严格、嵌套宽松 —— 这是有意的，不是漏检**：
 *   - 顶层 13 个键的**顺序本身是契约的一部分**（契约里明写「顶层 13 个键一个不少，
 *     顺序固定」），多一个顶层键就意味着输出形状不对，必须报；
 *   - 嵌套层**不拒绝契约外的属性**：阶段二校验的对象是 LLM 输出，
 *     LLM 常多吐一两个无害的辅助字段，严格拒绝会让整份推理被无谓地判废、白白重试三轮；
 *   - 契约机读块未声明 `additionalProperties`，本层不检查契约外属性。
 *     （这是控制方对「嵌套层多余属性是否该报」的裁决；改这个行为要显式决策，
 *     测试里有对应的守门用例钉住它。）
 */

/** 取一个值的类型名 */
function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 把对象的路径与键拼起来，根路径（空串）时不带前导点 */
function joinPath(path, key) {
  return path ? `${path}.${key}` : key;
}

/**
 * 校验一个值的**类型**是否符合 schema.type。
 *
 * 单独拆出来是为了让类型检查能排在枚举检查**前面**（见 checkValue 的说明）。
 *
 * @param {*} value 被校验的值
 * @param {string} [type] schema 声明的类型，没声明则不检查
 * @returns {string|null} 不匹配时返回中文说明；匹配（或没声明类型）返回 null
 */
function typeMismatch(value, type) {
  switch (type) {
    case 'object':
      return typeName(value) === 'object' ? null : `期望 object，实际 ${typeName(value)}`;
    case 'array':
      return Array.isArray(value) ? null : `期望 array，实际 ${typeName(value)}`;
    case 'string':
      return typeof value === 'string' ? null : `期望 string，实际 ${typeName(value)}`;
    case 'integer':
      if (typeof value === 'number' && Number.isInteger(value)) return null;
      // 注意：JSON.stringify(NaN) 是 "null"，会把 NaN 说成 null，所以这里特判
      return `期望 integer，实际 ${Number.isNaN(value) ? 'NaN' : JSON.stringify(value)}`;
    case 'number':
      return typeof value === 'number' ? null : `期望 number，实际 ${typeName(value)}`;
    default:
      return null;
  }
}

/**
 * 递归校验一个值是否符合 schema。
 * 支持：object / array / string / integer / number / enum / required / minItems / minLength。
 * 错误以 `路径: 说明` 的形式 push 进 defects。
 *
 * 检查顺序：**类型 → 枚举 → 其余约束**。
 * 类型不对时直接报类型错并返回，不再走枚举分支 ——
 * 类型错的取值本来也不可能合法命中枚举，同一字段报两次反而啰嗦。
 *
 * @param {*} value 被校验的值
 * @param {object} schema 该值对应的 schema 片段
 * @param {string} path 路径（不带根前缀；根对象传空串）
 * @param {string[]} defects 缺陷收集器
 */
function checkValue(value, schema, path, defects) {
  if (!schema || typeof schema !== 'object') return;

  // 一、类型检查（排在枚举检查前面）
  const typeError = typeMismatch(value, schema.type);
  if (typeError) {
    defects.push(`${path}: ${typeError}`);
    return;
  }

  // 二、枚举检查
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    defects.push(`${path}: 值 "${value}" 不在枚举 [${schema.enum.join(' / ')}] 内`);
    return;
  }

  // 三、其余约束
  switch (schema.type) {
    case 'object': {
      for (const key of schema.required || []) {
        if (!(key in value)) defects.push(`${joinPath(path, key)}: 必填字段缺失`);
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) checkValue(value[key], sub, joinPath(path, key), defects);
      }
      return;
    }
    case 'array': {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        defects.push(`${path}: 至少需要 ${schema.minItems} 项，实际 ${value.length} 项`);
      }
      if (schema.items) {
        value.forEach((item, i) => checkValue(item, schema.items, `${path}[${i}]`, defects));
      }
      return;
    }
    case 'string': {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        defects.push(`${path}: 不得为空串`);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * 从机读契约块里取「打法档位」这组闭合枚举。
 *
 * 刻意**不在代码里写死档位名** —— 契约源改了档位名，
 * 这里自动跟着改，不会出现「prompt 用新名、校验器认老名」的漂移。
 *
 * @param {object} schema 机读契约块
 * @returns {string[]} 档位清单，取不到时返回空数组
 */
function playbookScales(schema) {
  const node = schema
    && schema.properties
    && schema.properties.playbooks
    && schema.properties.playbooks.items
    && schema.properties.playbooks.items.properties
    && schema.properties.playbooks.items.properties.scale;
  return node && Array.isArray(node.enum) ? node.enum.slice() : [];
}

/**
 * 校验事业推理结果。
 *
 * @param {*} data 待校验的模型输出
 * @param {object} [schema] 机读契约块，默认用仓库里真实的 MACHINE_SCHEMA
 * @returns {string[]} 缺陷列表，空数组表示通过
 */
function collectDefects(data, schema) {
  const contract = schema || MACHINE_SCHEMA;
  // 顶层键的权威顺序来自契约的 required（与 schema.js 的 TOP_LEVEL_KEYS 同源）
  const topKeys = Array.isArray(contract.required) && contract.required.length
    ? contract.required.slice()
    : TOP_LEVEL_KEYS.slice();

  const defects = [];

  if (typeName(data) !== 'object') {
    defects.push(`整体: 期望 object，实际 ${typeName(data)}`);
    return defects;
  }

  // 键集：多一个少一个都要报
  const actual = Object.keys(data);
  for (const key of topKeys) {
    if (!actual.includes(key)) defects.push(`${key}: 顶层键缺失`);
  }
  for (const key of actual) {
    if (!topKeys.includes(key)) defects.push(`${key}: 顶层键不在契约里`);
  }

  // 键序：契约序之外的键忽略，只比共同的键的先后
  const common = actual.filter((k) => topKeys.includes(k));
  const expectedCommon = topKeys.filter((k) => common.includes(k));
  if (common.join(',') !== expectedCommon.join(',')) {
    defects.push(`键序: 顶层键顺序应为 ${expectedCommon.join(' → ')}，实际 ${common.join(' → ')}`);
  }

  // 结构与取值：逐个顶层键递归校验，路径从顶层键开始
  for (const key of topKeys) {
    if (key in data) {
      checkValue(data[key], contract.properties ? contract.properties[key] : null, key, defects);
    }
  }

  // 打法档位必须齐全（档位清单从契约源派生，不在代码里写死）
  //
  // 「四档齐全」的语义：**`scale` 枚举的每一个取值**都必须在 `playbooks` 里出现一档。
  // 这依赖 `scale` 是**闭合集合**（契约里如此声明）；若将来契约把 `scale` 改成开放集合，
  // 这条检查要改。
  //
  // 另：契约**未禁止**同一档位出现两次，本校验器也**不禁止**（不擅自加严契约）。
  const scales = playbookScales(contract);
  if (scales.length && Array.isArray(data.playbooks)) {
    const present = new Set(data.playbooks.map((p) => p && p.scale));
    for (const need of scales) {
      if (!present.has(need)) {
        defects.push(`playbooks: 缺「${need}」这一档，打法档位必须齐全`);
      }
    }
  }

  // timeline[].playbook 必须指向某个 playbooks[].scale
  if (Array.isArray(data.playbooks) && Array.isArray(data.timeline)) {
    const present = new Set(data.playbooks.map((p) => p && p.scale));
    data.timeline.forEach((step, i) => {
      if (!step || typeof step !== 'object') return;
      if (typeof step.playbook === 'string' && !present.has(step.playbook)) {
        defects.push(`timeline[${i}].playbook: 取值 "${step.playbook}" 不是任何一个 playbooks[].scale`);
      }
    });
  }

  return defects;
}

/**
 * 校验事业推理结果（用仓库里真实的契约）。
 *
 * @param {*} data 待校验的模型输出
 * @returns {string[]} 缺陷列表，空数组表示通过
 */
function careerDefects(data) {
  return collectDefects(data, MACHINE_SCHEMA);
}

/**
 * @param {*} data 待校验的模型输出
 * @returns {{ok: boolean, defects: string[]}}
 */
function validateCareer(data) {
  const defects = careerDefects(data);
  return { ok: defects.length === 0, defects };
}

module.exports = {
  validateCareer,
  careerDefects,
  collectDefects,
  checkValue,
  typeName,
  playbookScales,
};
