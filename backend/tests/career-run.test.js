'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../src/llm/client', () => ({
  callMiniMax: jest.fn(),
  parseLLMJson: jest.fn(),
  friendlyError: jest.fn((e) => String(e && e.message)),
}));

const client = require('../src/llm/client');
const { runCareerOnce, runCareerRounds } = require('../src/career/run');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'CAREER_SCHEMA.sample.json'), 'utf8'));

const CHART = { pillars: { year: '戊辰', month: '己未', day: '乙亥', hour: '乙酉' } };

describe('阶段二的调用与校验', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('输出合规时返回数据', async () => {
    client.callMiniMax.mockResolvedValue('{"ok":true}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce(CHART);
    expect(r.data).not.toBeNull();
    expect(r.defects).toEqual([]);
  });

  test('输出不合规时返回 null 与缺陷列表', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const bad = JSON.parse(JSON.stringify(SAMPLE));
    delete bad.directions;
    client.parseLLMJson.mockReturnValue(bad);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.defects.join()).toContain('directions');
  });

  test('响应连 JSON 都不是时 parsed 为 false', async () => {
    client.callMiniMax.mockResolvedValue('这不是 JSON');
    client.parseLLMJson.mockReturnValue(null);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.parsed).toBe(false);
  });

  test('四柱被改写时判废', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const tampered = JSON.parse(JSON.stringify(SAMPLE));
    tampered.case.pillars.year = '庚午';
    client.parseLLMJson.mockReturnValue(tampered);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.defects.join()).toContain('四柱');
  });

  test('整轮重试：第一轮不合规、第二轮合规时返回第二轮的数据', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    const bad = JSON.parse(JSON.stringify(SAMPLE));
    delete bad.directions;
    client.parseLLMJson
      .mockReturnValueOnce(bad)
      .mockReturnValueOnce(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerRounds(CHART, { maxRounds: 3 });
    expect(r.data).not.toBeNull();
    expect(client.callMiniMax).toHaveBeenCalledTimes(2);
  });

  test('多轮都不合规时返回 null，且不抛异常', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue({});
    const r = await runCareerRounds(CHART, { maxRounds: 2 });
    expect(r.data).toBeNull();
    expect(client.callMiniMax).toHaveBeenCalledTimes(2);
  });

  test('成功时附带渲染好的散文', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerRounds(CHART, { maxRounds: 1 });
    expect(r.prose).toContain('策略总纲');
    expect(r.prose).toContain('底盘待机');
  });

  test('注入的 callLLM 优先于默认实现', async () => {
    const fake = jest.fn().mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce(CHART, { callLLM: fake });
    expect(fake).toHaveBeenCalled();
    expect(r.data).not.toBeNull();
  });

  test('调用失败时 defects 必须是中文', async () => {
    client.callMiniMax.mockRejectedValue(new Error('timeout of 300000ms exceeded'));
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.parsed).toBe(false);
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]).toMatch(/[一-龥]/); // 必须含中文
    expect(r.defects[0]).not.toMatch(/timeout/i); // 不能有英文原文
  });

  test('命盘缺少四柱时判废并给出中文说明', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce({});
    expect(r.data).toBeNull();
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]).toMatch(/[一-龥]/);
    expect(r.defects[0]).toMatch(/四柱/);
  });

  test('命盘整体为 null 时不抛异常、返回 null', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce(null);
    expect(r.data).toBeNull();
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]).toMatch(/[一-龥]/);
  });

  /**
   * D-7：四柱比对必须**四柱都比**。
   *
   * 复审实测：把比对循环改成只比 ['year']，原有 12 条测试全绿 ——
   * 也就是说模型把月/日/时柱改写了，校验根本查不出来。
   */
  test.each(['month', 'day', 'hour'])('四柱的 %s 被改写时判废', async (key) => {
    client.callMiniMax.mockResolvedValue('{}');
    const tampered = JSON.parse(JSON.stringify(SAMPLE));
    tampered.case.pillars[key] = '庚午';
    client.parseLLMJson.mockReturnValue(tampered);
    const r = await runCareerOnce(CHART);
    expect(r.data).toBeNull();
    expect(r.defects.join()).toContain('四柱');
    expect(r.defects.join()).toContain(key);
  });

  /**
   * D-8：命盘缺四柱时**不能调模型**。
   *
   * 缺四柱是纯本地就能判定的缺陷，检查放在调模型之前，
   * 才不会白烧 3 次真实 LLM 调用 + 3 条错误日志。
   */
  test('命盘缺少四柱时判废，且一次模型调用都不发', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const r = await runCareerOnce({});
    expect(r.data).toBeNull();
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]).toMatch(/四柱/);
    // 关键断言：模型根本没被调用
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  /**
   * D-9：chart.pillars 是对象但缺某个键 ⇒ 不能误导性归因成「模型改写了时辰」。
   */
  test('命盘四柱缺 hour 键时归因为缺少四柱，不出现 undefined', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const chart = { pillars: { year: '戊辰', month: '己未', day: '乙亥' } };
    const r = await runCareerOnce(chart);
    expect(r.data).toBeNull();
    expect(r.defects).toHaveLength(1);
    expect(r.defects[0]).toMatch(/四柱/);
    // 不能出现英文 undefined，也不能归因成「模型改写」
    expect(r.defects[0]).not.toMatch(/undefined/);
    expect(r.defects[0]).not.toMatch(/被改写/);
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });

  test('命盘四柱的值是空串时同样归因为缺少四柱', async () => {
    client.callMiniMax.mockResolvedValue('{}');
    client.parseLLMJson.mockReturnValue(JSON.parse(JSON.stringify(SAMPLE)));
    const chart = { pillars: { year: '戊辰', month: '己未', day: '乙亥', hour: '   ' } };
    const r = await runCareerOnce(chart);
    expect(r.data).toBeNull();
    expect(r.defects[0]).toMatch(/四柱/);
    expect(client.callMiniMax).not.toHaveBeenCalled();
  });
});

describe('四柱键名的唯一来源', () => {
  test('四柱键名从 core/interactions 引入，不在 run.js 里写死', () => {
    // 用 require.resolve 定位「真正被加载的那份」run.js ——
    // 变异验证会把改坏的副本映射成这个模块，源码扫描必须扫同一份，
    // 否则这条守门在变异下永远看不见（= 没有判别力）。
    const src = fs.readFileSync(require.resolve('../src/career/run'), 'utf8');
    // 只看模块名，不看 require 的具体写法（变异工具会把相对路径改写成绝对路径）
    expect(src).toMatch(/core\/interactions/);
    expect(src).not.toMatch(/\[\s*'year'\s*,\s*'month'\s*,\s*'day'\s*,\s*'hour'\s*\]/);
  });
});
