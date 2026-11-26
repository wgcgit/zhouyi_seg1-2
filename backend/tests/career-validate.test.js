'use strict';

const fs = require('fs');
const path = require('path');
const { validateCareer, careerDefects, collectDefects, checkValue } = require('../src/career/validate');
const { MACHINE_SCHEMA } = require('../src/career/schema');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

/** 深拷贝，避免改动污染原对象 */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/** 按给定的键序重新组装一个对象（键序在契约判定里有意义，所以要保真） */
function orderedBy(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

/**
 * JSON Schema 的 `type` 取值空间是**标准有限集**（共 7 个）。
 *
 * 这不是一份「校验器能力表」的复制品，而是**取值空间本身**：
 * 契约里的 type 只能取自这 7 个值，剩下的事情（校验器到底管不管）由探测决定。
 */
const JSON_SCHEMA_TYPE_SPACE = ['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'];

/**
 * 每个候选 type 对应的「**确实不满足**该 type 的坏值」——
 * 用来探校验器对这一种 type 到底管不管。
 */
const BAD_VALUE_BY_TYPE = {
  object: 'abc',      // 字符串不是 object
  array: 'abc',       // 字符串不是 array
  string: 123,        // 数字不是 string
  integer: 1.5,       // 非整数不是 integer
  number: 'abc',      // 字符串不是 number
  boolean: 'abc',     // 字符串不是 boolean
  null: 'abc',        // 字符串不是 null
};

/**
 * 探测校验器**到底管不管**某个 type。
 *
 * 做法：造一个**不满足**该 type 的值，丢给 checkValue 看它报不报类型缺陷：
 *   - 报了类型缺陷 → 校验器**真的在管**这个 type → 这个 type 是合法的；
 *   - 什么都没报   → 校验器会**静默忽略**这个 type → 这个 type 不合法
 *     （拼错的 type 落进 typeMismatch 的 default 分支，就是这种静默漏检）。
 *
 * @param {string} type 候选 type 取值
 * @param {*} badValue 不满足该 type 的坏值
 * @returns {boolean} 校验器是否在管这个 type
 */
function probeTypeHandled(type, badValue) {
  const defects = [];
  checkValue(badValue, { type }, 'f', defects);
  // 类型缺陷的消息形如「f: 期望 string，实际 number」
  return defects.some((d) => d.includes('期望 '));
}

/**
 * 从「行为探测」里派生校验器真正支持的 type 集合。
 *
 * 关键点：**不在别处再写死一份 type 清单**。
 * 校验器的 type 能力表写在 validate.js 的 typeMismatch 里，
 * 那份表一改，这里自动跟着变，不会出现「守门测试放行了一个校验器根本不管的 type」。
 *
 * @param {(type: string, badValue: *) => boolean} probe 探测函数（可注入，便于验证它不是恒真）
 * @returns {string[]} 校验器真正在管的 type 集合（按取值空间的顺序）
 */
function deriveLegalTypes(probe) {
  return JSON_SCHEMA_TYPE_SPACE.filter((type) => probe(type, BAD_VALUE_BY_TYPE[type]));
}

/**
 * 校验器真正在管的 type 集合 —— **探测出来的**，不是写死的。
 *
 * 实测结果应为 object / array / string / integer / number 五个；
 * boolean 与 null 落进 typeMismatch 的 default 分支，会被**静默忽略**，故不合法。
 */
const LEGAL_SCHEMA_TYPES = deriveLegalTypes(probeTypeHandled);

/**
 * 派生集合的**期望值**（只作为断言的钉子，不是能力表本身）。
 */
const EXPECTED_LEGAL_TYPES = ['object', 'array', 'string', 'integer', 'number'];

/**
 * 找出契约里的「字段没人检查」的缺口（**递归**版）：
 *   1. `required` 里有、但同层 `properties` 里没有的键（这种键完全不会被校验）——
 *      每一层 object 节点都要查，不只是顶层；
 *   2. 节点既没声明 `type` 又没声明 `enum`（这种节点的值完全不被检查）——
 *      **`items` 节点自身也要查**（items 是空对象 = 数组元素零约束）；
 *   3. 节点的 `type` 取值不在合法集合里（拼错的 type 会被静默放过）。
 *
 * @param {object} schema 机读契约块
 * @returns {Array<{kind: string, path: string}>} 缺口列表
 */
function findSchemaGaps(schema) {
  const gaps = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;

    // 一、本层 required ⊆ 本层 properties（顶层与嵌套层一视同仁）
    const props = (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties))
      ? node.properties
      : null;
    if (Array.isArray(node.required)) {
      for (const key of node.required) {
        if (!props || !Object.prototype.hasOwnProperty.call(props, key)) {
          gaps.push({ kind: 'required-not-in-properties', path: path ? `${path}.${key}` : key });
        }
      }
    }

    // 二、本节点自身（含 items 节点）必须有 type 或 enum；有 type 则取值必须合法
    if (node.type === undefined && node.enum === undefined) {
      gaps.push({ kind: 'no-type-no-enum', path: path || '<根>' });
    } else if (node.type !== undefined && !LEGAL_SCHEMA_TYPES.includes(node.type)) {
      gaps.push({ kind: 'illegal-type', path: path || '<根>', type: node.type });
    }

    // 三、递归
    if (props) {
      for (const [key, sub] of Object.entries(props)) {
        walk(sub, path ? `${path}.${key}` : key);
      }
    }
    if (node.items) walk(node.items, path ? `${path}[]` : '[]');
  };
  walk(schema, '');
  return gaps;
}

/** 契约里的四个打法档位名 */
const TIER_NAMES = ['早期', '轻创业', '重资产', '合伙'];

/**
 * 扫一遍 JS 源码，收集所有**字符串字面量**的内容。
 *
 * 注释里的内容**不算**字面量 —— 这正是上一版守门测试误报的原因：
 * 「两个字面量之间的中文注释」被当成了一个字面量（同行误报）。
 * 所以这里用一个小型扫描器把注释整段跳过，只收真正的字面量。
 *
 * 已知限制：本扫描器不识别正则字面量（`/.../`）。validate.js 里没有正则字面量；
 * 若将来引入了含引号的正则字面量，需要同步扩展这个扫描器。
 *
 * @param {string} src JS 源码文本
 * @returns {string[]} 字面量内容列表（模板串按字面片段拆开）
 */
function collectStringLiterals(src) {
  const literals = [];
  const n = src.length;
  let i = 0;

  /** 单引号 / 双引号字符串 */
  function scanQuoted(quote) {
    i++;                                       // 跳过开引号
    let buf = '';
    while (i < n) {
      if (src[i] === '\\') { buf += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (src[i] === quote) { i++; break; }
      buf += src[i]; i++;
    }
    literals.push(buf);
  }

  /** 模板串（要处理 ${} 插值，插值里可能有嵌套的引号与模板串） */
  function scanTemplate() {
    i++;                                       // 跳过开反引号
    let buf = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { buf += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') {
        literals.push(buf); buf = '';
        i += 2;
        scanInterpolation();
        continue;
      }
      buf += c; i++;
    }
    literals.push(buf);
  }

  /** 模板串的 ${ } 插值部分：里面是**代码**，按花括号深度找配对的 } */
  function scanInterpolation() {
    let depth = 1;                            // 已经进了一对 ${ }
    while (i < n) {
      const c = src[i];
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') { depth--; i++; if (depth === 0) return; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"') { scanQuoted(c); continue; }
      if (c === '`') { scanTemplate(); continue; }
      i++;
    }
  }

  /** 普通代码区：跳过注释，遇到引号就收字面量 */
  function scanCode() {
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"') { scanQuoted(c); continue; }
      if (c === '`') { scanTemplate(); continue; }
      i++;
    }
  }

  scanCode();
  return literals;
}

/**
 * 找出源码里**以字符串字面量形式**出现的打法档位名 —— 那就是硬编码。
 *
 * @param {string} src JS 源码文本
 * @returns {string[]} 被硬编码的档位名
 */
function findHardcodedTierNames(src) {
  const literals = collectStringLiterals(src);
  return TIER_NAMES.filter((name) => literals.some((lit) => lit.includes(name)));
}

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

  // ---- 以下为「控制方补充」要求的额外用例 ----

  test('顶层键多一个不在契约里要报错', () => {
    const d = clone(SAMPLE);
    d.多出来的键 = { foo: 'bar' };
    const defects = careerDefects(d);
    expect(defects.join()).toContain('多出来的键');
  });

  test('字段类型不对要报错', () => {
    const d = clone(SAMPLE);
    d.pattern = '不是对象';
    const defects = careerDefects(d);
    expect(defects.join()).toContain('pattern');
    expect(defects.join()).toContain('object');
  });

  test('打法档位清单从契约源派生：契约里改了档位名，校验行为跟着变', () => {
    // 造一份「档位多了一档」的契约：新增「合伙扩张」这一档
    const modified = clone(MACHINE_SCHEMA);
    modified.properties.playbooks.items.properties.scale.enum = [
      '早期', '轻创业', '重资产', '合伙', '合伙扩张',
    ];
    const defects = collectDefects(clone(SAMPLE), modified);
    // 样例缺「合伙扩张」这一档 —— 校验器按**改过的契约**要求，所以要报出来
    expect(defects.join()).toContain('playbooks');
    expect(defects.join()).toContain('合伙扩张');
    // 而用仓库里真实的契约，样例是齐的，不该报这一条
    expect(careerDefects(clone(SAMPLE))).toEqual([]);
  });

  test('运行时代码里没有把打法档位写死成字面量', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'backend', 'src', 'career', 'validate.js'),
      'utf8',
    );
    // 只要有哪个档位名出现在**字符串字面量**里，就算硬编码了
    // （注释里的提及不算 —— 中文注释里写档位名是正常的）
    expect(findHardcodedTierNames(src)).toEqual([]);
  });

  test('中文注释里提到档位名不算硬编码', () => {
    // 整行注释、整段注释、行尾注释三种形态
    const src = [
      '// 早期 档位指的是刚起步',
      'const a = 1; // 轻创业 与 重资产 与 合伙',
      '/* 合伙 这一档用于合伙人模式 */',
      'const b = 2; /* 早期 */',
    ].join('\n');
    expect(findHardcodedTierNames(src)).toEqual([]);
  });

  test('同一行内两个字面量之间的中文注释不算硬编码', () => {
    // 上一版守门测试在同行注释上误报：注释夹在两个字面量之间，
    // 正则把「前一个字面量的收尾引号」到「后一个字面量的起始引号」当成了一段字面量。
    const src = "const a = 'x' /* 早期 */ + 'y';";
    expect(findHardcodedTierNames(src)).toEqual([]);
  });

  test('真的把四档写死成字面量会被抓出来', () => {
    const src = "const SCALES = ['早期', '轻创业', '重资产', '合伙'];";
    expect(findHardcodedTierNames(src)).toEqual(['早期', '轻创业', '重资产', '合伙']);
  });

  test('真实 validate.js 追加中文注释仍绿、追加硬编码四档就变红', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'backend', 'src', 'career', 'validate.js'),
      'utf8',
    );
    const withComment = src + '\n// 早期 轻创业 重资产 合伙 这四个档位只是说明，不是硬编码\n';
    expect(findHardcodedTierNames(withComment)).toEqual([]);
    const withHardcode = src + "\nconst HARDCODED = ['早期', '轻创业', '重资产', '合伙'];\n";
    expect(findHardcodedTierNames(withHardcode).sort())
      .toEqual(['早期', '轻创业', '重资产', '合伙'].sort());
  });

  // ---- 以下为「复审修复」要求的额外用例 ----

  test('类型错时报「期望 string」，不被枚举错掩盖', () => {
    const d = clone(SAMPLE);
    d.pattern.verdict = 123;               // 类型错（number），不是枚举错
    const defects = careerDefects(d);
    expect(defects.join()).toContain('pattern.verdict');
    expect(defects.join()).toContain('期望 string');
    // 不该再报枚举错（类型错的取值本来也不可能合法命中枚举）
    expect(defects.join()).not.toContain('不在枚举');
  });

  test('类型对但不在枚举里，仍然报枚举错', () => {
    const d = clone(SAMPLE);
    d.pattern.verdict = '大吉';             // 是 string，但不在枚举里
    const defects = careerDefects(d);
    expect(defects.join()).toContain('pattern.verdict');
    expect(defects.join()).toContain('不在枚举');
  });

  test('契约的 required 键集是 properties 键集的子集', () => {
    // 否则 required 里那些不在 properties 里的键，值会完全不被校验
    const gaps = findSchemaGaps(MACHINE_SCHEMA)
      .filter((g) => g.kind === 'required-not-in-properties');
    expect(gaps).toEqual([]);
  });

  test('契约 properties 里每个字段都至少声明了 type 或 enum', () => {
    // 否则既没 type 又没 enum 的字段，其值会完全不被校验（checkValue 的 default 分支）
    const gaps = findSchemaGaps(MACHINE_SCHEMA)
      .filter((g) => g.kind === 'no-type-no-enum');
    expect(gaps).toEqual([]);
  });

  test('缺口检测器本身能发现人为制造的契约缺口（证明上面两条断言不是恒真）', () => {
    const broken = clone(MACHINE_SCHEMA);
    broken.required.push('根本不存在的键');                 // required ⊄ properties
    broken.properties.pattern.properties.verdict = {};       // 既没 type 又没 enum
    const gaps = findSchemaGaps(broken);
    expect(gaps.map((g) => g.kind)).toContain('required-not-in-properties');
    expect(gaps.map((g) => g.kind)).toContain('no-type-no-enum');
  });

  test('嵌套层多一个契约外的属性不算缺陷（这是有意的宽松，不是漏检）', () => {
    // 控制方裁决：顶层严格、嵌套宽松。
    // 契约机读块未声明 additionalProperties，嵌套层的契约外属性不报。
    // 这条测试是「钉住行为」—— 将来若有人改成严格，测试会红，逼出一次显式决策。
    const d = clone(SAMPLE);
    d.pattern.note = '模型顺手多写的辅助说明';               // pattern 里没有 note
    d.timeline[0].remark = '另一处多余的辅助字段';            // timeline[] 里没有 remark
    expect(careerDefects(d)).toEqual([]);
    // 而**顶层**多一个键仍然要报（顶层是严格的）
    const d2 = clone(SAMPLE);
    d2.多出来的键 = { foo: 'bar' };
    expect(careerDefects(d2).join()).toContain('多出来的键');
  });

  test('顶层键序从契约源派生：契约改了 required 顺序，键序判定跟着变', () => {
    const modified = clone(MACHINE_SCHEMA);
    const moved = modified.required.pop();     // 把最后一个键挪到最前面
    modified.required.unshift(moved);
    const newOrder = modified.required.slice();

    // 数据按**改过的契约**的键序 → 不该报键序错
    const ordered = orderedBy(clone(SAMPLE), newOrder);
    expect(collectDefects(ordered, modified).filter((x) => x.startsWith('键序:'))).toEqual([]);

    // 数据按**原契约**的键序 → 拿改过的契约看就是错序，
    // 缺陷信息里的「应为」顺序必须跟着契约变
    const bad = collectDefects(clone(SAMPLE), modified);
    const orderDefect = bad.find((x) => x.startsWith('键序:'));
    expect(orderDefect).toBeDefined();
    expect(orderDefect).toContain(`顶层键顺序应为 ${newOrder.join(' → ')}`);

    // 而用仓库里真实的契约，样例键序是对的，不该报键序错
    expect(careerDefects(clone(SAMPLE)).filter((x) => x.startsWith('键序:'))).toEqual([]);
  });

  test('year 为 NaN 时消息说 NaN 而不是 null', () => {
    const d = clone(SAMPLE);
    d.timeline[0].liunianWindows[0].year = NaN;
    const defects = careerDefects(d);
    expect(defects.join()).toContain('期望 integer');
    expect(defects.join()).toContain('NaN');
    expect(defects.join()).not.toContain('实际 null');
  });

  // ---- 以下为「第二次复审」要求的额外用例（M-a：契约缺口的递归检测） ----

  test('契约自身没有 schema 缺口（递归版检测器全量检查）', () => {
    // 一条断言把整份契约钉住：递归走遍 properties 与 items，
    // 每一层的 required ⊆ properties，每个节点都有 type 或 enum，type 取值合法。
    expect(findSchemaGaps(MACHINE_SCHEMA)).toEqual([]);
  });

  test('检测器能发现「数组 items 是空对象」—— 数组元素完全不被校验', () => {
    const broken = { type: 'object', properties: { arr: { type: 'array', items: {} } } };
    const gaps = findSchemaGaps(broken);
    expect(gaps.map((g) => g.kind)).toContain('no-type-no-enum');
    // 报告里要能看出是哪个缺口（路径）
    const gap = gaps.find((g) => g.kind === 'no-type-no-enum');
    expect(gap.path).toBe('arr[]');
  });

  test('检测器能发现「嵌套层 required 有键而 properties 里没有」', () => {
    const broken = {
      type: 'object',
      properties: {
        o: { type: 'object', required: ['x'], properties: {} },
      },
    };
    const gaps = findSchemaGaps(broken);
    expect(gaps.map((g) => g.kind)).toContain('required-not-in-properties');
    const gap = gaps.find((g) => g.kind === 'required-not-in-properties');
    expect(gap.path).toBe('o.x');
  });

  test('检测器能发现「type 取值拼错」—— 校验器会静默放过', () => {
    const broken = { type: 'object', properties: { f: { type: 'strng' } } };
    const gaps = findSchemaGaps(broken);
    expect(gaps.map((g) => g.kind)).toContain('illegal-type');
    const gap = gaps.find((g) => g.kind === 'illegal-type');
    expect(gap.path).toBe('f');
    expect(gap.type).toBe('strng');
  });

  test('合法 type 集合是由行为探测派生出来的（不是写死的清单）', () => {
    // 派生逻辑：拿一个不满足该 type 的坏值去探校验器 ——
    //   报类型缺陷 → 校验器真的在管 → 合法；
    //   什么都没报 → 校验器静默忽略 → 不合法。
    // 实测结果：object / array / string / integer / number 五个。
    // boolean 与 null 会落进 typeMismatch 的 default 分支，被静默忽略。
    expect(LEGAL_SCHEMA_TYPES).toEqual(EXPECTED_LEGAL_TYPES);
  });

  test('派生不是恒真：把 number 的探测结果改坏，派生集合断言就会红', () => {
    // 注入一个「坏的探测」：对 number 一律说不合法
    const brokenProbe = (type, badValue) => (
      type === 'number' ? false : probeTypeHandled(type, badValue)
    );
    const broken = deriveLegalTypes(brokenProbe);

    // 改坏之后派生集合确实变了（少了 number）—— 说明派生真的受探测结果支配
    expect(broken).not.toEqual(LEGAL_SCHEMA_TYPES);
    expect(broken).not.toContain('number');
    expect(broken).toEqual(['object', 'array', 'string', 'integer']);

    // 同一条「派生集合 = 期望集合」的断言，对改坏的集合**会红**
    expect(() => expect(broken).toEqual(EXPECTED_LEGAL_TYPES)).toThrow();
  });

  test('契约里用到的每个 type 都在派生集合里（校验器不管的 type 不许进契约）', () => {
    // 收集契约里真实出现的 type 取值
    const used = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type !== undefined) used.add(node.type);
      if (node.properties) for (const sub of Object.values(node.properties)) walk(sub);
      if (node.items) walk(node.items);
    };
    walk(MACHINE_SCHEMA);

    // 契约当前用到的 type 就是这四个（钉住契约现状）
    expect([...used].sort()).toEqual(['array', 'integer', 'object', 'string']);

    // 契约用到的每一个 type，校验器都真的在管 —— 这条才是「不许进契约的 type」的把关
    for (const type of used) {
      expect(LEGAL_SCHEMA_TYPES).toContain(type);
    }
  });

  test('契约里塞一个校验器不管的 type（boolean），缺口检测器要抓出来', () => {
    // boolean 落进 typeMismatch 的 default 分支 → 静默漏检，
    // 所以它既不在派生集合里，也不许出现在契约里。
    const broken = clone(MACHINE_SCHEMA);
    broken.properties.pattern.properties.flag = { type: 'boolean' };
    const gaps = findSchemaGaps(broken);
    expect(gaps.map((g) => g.kind)).toContain('illegal-type');
    const gap = gaps.find((g) => g.kind === 'illegal-type');
    expect(gap.path).toBe('pattern.flag');
    expect(gap.type).toBe('boolean');
  });
});
