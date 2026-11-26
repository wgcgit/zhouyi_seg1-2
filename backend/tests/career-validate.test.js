'use strict';

const fs = require('fs');
const path = require('path');
const { validateCareer, careerDefects, collectDefects } = require('../src/career/validate');
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
 * 找出契约里的「字段没人检查」的缺口：
 *   1. `required` 里有、但 `properties` 里没有的键（这种键完全不会被校验）；
 *   2. `properties` 里既没声明 `type` 又没声明 `enum` 的字段（这种字段的值完全不被检查）。
 *
 * @param {object} schema 机读契约块
 * @returns {Array<{kind: string, path: string}>} 缺口列表
 */
function findSchemaGaps(schema) {
  const gaps = [];
  const props = (schema && schema.properties) || {};
  for (const key of (schema && schema.required) || []) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) {
      gaps.push({ kind: 'required-not-in-properties', path: key });
    }
  }
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) {
      for (const [key, sub] of Object.entries(node.properties)) {
        const p = path ? `${path}.${key}` : key;
        if (!sub || (!sub.type && !sub.enum)) {
          gaps.push({ kind: 'no-type-no-enum', path: p });
        }
        walk(sub, p);
      }
    }
    if (node.items) walk(node.items, path ? `${path}[]` : '[]');
  };
  walk(schema, '');
  return gaps;
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
    // （用字面量匹配而不是全文匹配，免得中文注释里提到档位名就误报）
    // 注意：字符类里排除 `\n` —— 否则两个字符串字面量**之间**的中文注释
    // （提到档位名）会被跨行匹配上，误判成硬编码。
    for (const name of ['早期', '轻创业', '重资产', '合伙']) {
      const asLiteral = new RegExp(`['"\`][^'"\`\\n]*${name}[^'"\`\\n]*['"\`]`);
      expect(asLiteral.test(src)).toBe(false);
    }
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
});
