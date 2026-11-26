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
});
