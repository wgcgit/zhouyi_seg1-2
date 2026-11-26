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
