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
