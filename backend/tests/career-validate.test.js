'use strict';

const fs = require('fs');
const path = require('path');
const { validateCareer, careerDefects, collectDefects } = require('../src/career/validate');
const { MACHINE_SCHEMA } = require('../src/career/schema');

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
    for (const name of ['早期', '轻创业', '重资产', '合伙']) {
      const asLiteral = new RegExp(`['"\`][^'"\`]*${name}[^'"\`]*['"\`]`);
      expect(asLiteral.test(src)).toBe(false);
    }
  });
});
