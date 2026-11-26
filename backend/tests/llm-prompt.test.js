'use strict';

const fs = require('fs');
const path = require('path');
const {
  extractSection,
  extractInterpretation,
  buildCareerSystemPrompt,
  buildCareerUserPrompt,
  buildChatSystemPrompt,
  buildChatUserPrompt,
} = require('../src/llm/prompt');

const SKILLS = path.join(__dirname, '..', 'skills', 'bazi-tuipan');

describe('skill 段落提取', () => {
  test('extractSection 取到指定段，且不含下一个二级标题', () => {
    const md = fs.readFileSync(path.join(SKILLS, 'shiye-master.skill.md'), 'utf8');
    const out = extractSection(md, '输出规范（固化在此文件，必须严格遵守）');
    expect(out).toContain('推进顺序');
    expect(out).not.toContain('## Interpretation');
  });

  test('extractSection 取不到时返回空串', () => {
    expect(extractSection('# 标题', '不存在的段')).toBe('');
  });

  test('extractInterpretation 取的是 Interpretation 段', () => {
    const md = fs.readFileSync(path.join(SKILLS, 'tiaohou-shiye', 'SKILL.md'), 'utf8');
    const out = extractInterpretation(md);
    expect(out).toContain('调候');
    expect(out).not.toContain('## A2');
  });
});

describe('extractSection 的行锚定（标题必须独占一行且恰好是 ## <heading>）', () => {
  test('正文里提到同名标题不算命中，取的是真段', () => {
    const md = '正文里提到 ## Sec 这个词。\n\n## Sec\nREAL\n';
    expect(extractSection(md, 'Sec')).toBe('REAL');
  });

  test('标题被改长（## Sec 补充）不算命中', () => {
    const md = '## Interpretation（核心方法论）补充\n\n正文\n';
    expect(extractSection(md, 'Interpretation（核心方法论）')).toBe('');
  });

  test('三级标题（### Sec）不算命中', () => {
    const md = '### Sec\n\n内容\n';
    expect(extractSection(md, 'Sec')).toBe('');
  });

  test('列表项（- ## Sec）不算命中', () => {
    const md = '- ## Sec\n\n内容\n';
    expect(extractSection(md, 'Sec')).toBe('');
  });

  test('段内的三级子节留在段里，段落结束只看下一个二级标题', () => {
    const md = '## Sec\n\n### 子节\n\n正文\n\n## Next\n\n别的\n';
    const out = extractSection(md, 'Sec');
    expect(out).toContain('### 子节');
    expect(out).not.toContain('## Next');
  });
});

describe('Interpretation 段的结构守门（真实 skill 文件）', () => {
  // 期望值由实际文件统计而来：子节数量 + 最后一个子节标题 + 段首字符
  const CASES = [
    { name: 'tiaohou-shiye', subs: 7, last: '七、七步操作顺序', firstChar: '调' },
    { name: 'geshi-shiye', subs: 4, last: '四、三条心法', firstChar: '格' },
    { name: 'wuxing-shiye', subs: 4, last: '四、与调候、格局的关系', firstChar: '五' },
    { name: 'suiyun-shiye', subs: 7, last: '七、四条禁忌', firstChar: '择' },
  ];

  for (const c of CASES) {
    test(`${c.name} 的 Interpretation 段保留全部三级子节`, () => {
      const md = fs.readFileSync(path.join(SKILLS, c.name, 'SKILL.md'), 'utf8');
      const out = extractInterpretation(md);
      const subs = out.split('\n').filter((l) => l.startsWith('### '));
      expect(subs).toHaveLength(c.subs);
      expect(subs[subs.length - 1]).toBe(`### ${c.last}`);
    });

    test(`${c.name} 的 Interpretation 段首字符没有被吞掉`, () => {
      const md = fs.readFileSync(path.join(SKILLS, c.name, 'SKILL.md'), 'utf8');
      const out = extractInterpretation(md);
      expect(out.charAt(0)).toBe(c.firstChar);
    });
  }

  test('tiaohou-shiye 的段尾也没被吞掉', () => {
    const md = fs.readFileSync(path.join(SKILLS, 'tiaohou-shiye', 'SKILL.md'), 'utf8');
    const out = extractInterpretation(md);
    // 段尾有一行 `---` 分隔线，剔除后看最后一行实质内容
    const content = out.split('\n').filter((l) => l.trim() !== '---' && l.trim() !== '');
    expect(content[content.length - 1]).toBe('7. **定策略**：主业重仓 / 底盘待机 / 守成缓投');
  });
});

describe('阶段二的 system prompt', () => {
  const prompt = buildCareerSystemPrompt();

  test('包含事业推理合同', () => {
    expect(prompt).toContain('事业推理合同');
    expect(prompt).toContain('13 个键一个不少');
  });

  test('包含 5 个事业 skill 的知识段', () => {
    for (const name of ['tiaohou-shiye', 'geshi-shiye', 'wuxing-shiye', 'suiyun-shiye', 'shiye-master']) {
      expect(prompt).toContain(name);
    }
  });

  test('master 的输出规范与 Execution 都注入了（10 键的老版本不能出现）', () => {
    expect(prompt).toContain('推进顺序');
    expect(prompt).toContain('13 个顶层键');
    expect(prompt).not.toContain('10 个顶层键');
    expect(prompt).toContain('填 `patternTracks`');
  });

  test('10 键的旧键序串一处都不能漏进 prompt', () => {
    // master 的「输出规范」与「Interpretation」两处都写过 10 键键序串，
    // Task 2 已把两处都改掉；这里断言 prompt 里看不到旧串
    expect(prompt).not.toContain('case → monthCommand → pattern → tiaoHou');
    expect(prompt).toContain('case → monthCommand → pattern → patternTracks');
  });

  test('包含 JSON Schema', () => {
    expect(prompt).toContain('"case"');
    expect(prompt).toContain('"careerPhases"');
    expect(prompt).toContain('"directions"');
  });

  test('子 skill 的 A2 与 Execution 不进 prompt', () => {
    expect(prompt).not.toContain('Future Trigger');
  });

  test('子 skill 的正文真的进了 prompt（不只是 skill 名）', () => {
    // 出自 backend/skills/bazi-tuipan/tiaohou-shiye/SKILL.md 第 51 行
    expect(prompt).toContain('急药优先于一般格局喜忌');
    expect(prompt).toContain('先分清「必须救的急药」还是「锦上添花的辅药」');
  });

  test('三级子节标题进了 prompt，且没有越出段边界', () => {
    expect(prompt).toContain('七、七步操作顺序');
    expect(prompt).not.toContain('## A2（Future Trigger）');
    expect(prompt).not.toContain('## Boundary');
  });

  test('master 的 Interpretation 段进了 prompt', () => {
    // 出自 backend/skills/bazi-tuipan/shiye-master.skill.md 第 41 行与第 88 行
    expect(prompt).toContain('四层的产出互相修正');
    expect(prompt).toContain('看着一块肥肉，啃不动还沾一身泥');
  });
});

describe('阶段二的 user prompt', () => {
  test('带上了命盘 JSON', () => {
    const chart = { pillars: { year: '戊辰', month: '己未', day: '乙亥', hour: '乙酉' } };
    const p = buildCareerUserPrompt(chart);
    expect(p).toContain('戊辰');
    expect(p).toContain('不要重新计算');
  });
});

describe('阶段三的 chat prompt', () => {
  const careerJson = { case: { gender: '男' }, summary: { strategy: '底盘待机' } };
  const careerProse = '## 策略总纲\n底盘待机';
  const prompt = buildChatSystemPrompt(careerJson, careerProse);

  test('包含本命推理结果的 JSON 与散文', () => {
    expect(prompt).toContain('底盘待机');
    expect(prompt).toContain('## 策略总纲');
  });

  test('JSON 与散文分别来自不同的源（JSON 被掏空要能测出来）', () => {
    const jsonOnly = '只出现在JSON里的标记';
    const proseOnly = '只出现在散文里的句子';
    const p = buildChatSystemPrompt({ marker: jsonOnly }, proseOnly);
    expect(p).toContain(jsonOnly);
    expect(p).toContain(proseOnly);
  });

  test('包含 skill 通用知识', () => {
    expect(prompt).toContain('wuxing-shiye');
    expect(prompt).toContain('suiyun-shiye');
  });

  test('不包含 master 的落笔指令（那是阶段二的事）', () => {
    expect(prompt).not.toContain('填 `case`');
    expect(prompt).not.toContain('产出校验');
  });

  test('user prompt 拼了历史与本轮提问', () => {
    const p = buildChatUserPrompt(
      [{ role: 'user', content: '我适合做什么行业？' }, { role: 'assistant', content: '宜向北发展。' }],
      '那我该往哪个方向搬家？',
    );
    expect(p).toContain('我适合做什么行业？');
    expect(p).toContain('那我该往哪个方向搬家？');
  });

  test('历史消息按角色标注：user 标「用户」、assistant 标「顾问」', () => {
    const p = buildChatUserPrompt(
      [{ role: 'user', content: '我适合做什么行业？' }, { role: 'assistant', content: '宜向北发展。' }],
      '那我该往哪个方向搬家？',
    );
    expect(p).toContain('用户：我适合做什么行业？');
    expect(p).toContain('顾问：宜向北发展。');
    expect(p).toContain('用户：那我该往哪个方向搬家？');
    // 本轮提问必须是最后一行
    expect(p.trim().split('\n').pop()).toBe('用户：那我该往哪个方向搬家？');
  });
});

describe('buildChatUserPrompt 的 history 容错', () => {
  test('history 是对象时不抛异常', () => {
    expect(() => buildChatUserPrompt({}, '问题')).not.toThrow();
    expect(buildChatUserPrompt({}, '问题')).toBe('用户：问题');
  });

  test('history 是数字时不抛异常', () => {
    expect(() => buildChatUserPrompt(123, '问题')).not.toThrow();
    expect(buildChatUserPrompt(123, '问题')).toBe('用户：问题');
  });

  test('history 是 null 时不抛异常（回归）', () => {
    expect(() => buildChatUserPrompt(null, '问题')).not.toThrow();
    expect(buildChatUserPrompt(null, '问题')).toBe('用户：问题');
  });

  test('history 是字符串时按空列表处理（行为不变）', () => {
    expect(() => buildChatUserPrompt('ab', '问题')).not.toThrow();
    expect(buildChatUserPrompt('ab', '问题')).toBe('用户：问题');
  });

  test('非数组 history 的内容不会混进 prompt', () => {
    const p = buildChatUserPrompt({ content: '这是伪历史' }, '问题');
    expect(p).not.toContain('这是伪历史');
    expect(p).toBe('用户：问题');
  });
});
