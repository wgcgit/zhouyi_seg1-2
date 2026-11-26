'use strict';

/**
 * 事业推理结果渲染器：把「符合契约的事业推理 JSON」渲染成一篇给人读的 Markdown 散文。
 *
 * 设计要点：
 * - 段落顺序 = 契约键序（case → monthCommand/pattern → patternTracks → careerPhases
 *   → tiaoHou → xiJi → boundaries → directions → playbooks → timeline → transition → summary）。
 * - 月令与格局合并成一段（对齐《事业推理结果.txt》的 L4）。
 * - 散文里**不出现 JSON 键名**，只出现中文标题与契约里的中文/短句取值。
 */

/** 五行运 → 该运常见地支（渲染时括注用） */
const BRANCHES_BY_TYPE = {
  '水运': '亥、子',
  '木运': '寅、卯',
  '火运': '巳、午',
  '土运': '辰、戌、丑、未',
  '金运': '申、酉',
};

/** 契约键 → 散文小标题（顺序即输出顺序） */
const SECTION_TITLES = {
  case: '八字命例',
  monthCommand: '月令',
  pattern: '格局',
  patternTracks: '格局赛道',
  careerPhases: '事业阶段',
  tiaoHou: '调候',
  xiJi: '喜忌',
  boundaries: '边界',
  directions: '方位与行业',
  playbooks: '打法',
  timeline: '大运',
  transition: '交运',
  summary: '策略总纲',
};

/**
 * 把 timeline 按相邻同五行类型归组。
 *
 * 只合并**相邻**的同类型步骤：类型变了就另起一组，
 * 这样「大运」段落读下来能看出运程的转折点。
 *
 * @param {Array<{type: string}>} timeline
 * @returns {Array<{type: string, steps: Array<object>}>}
 */
function groupTimelineByType(timeline) {
  const groups = [];
  for (const step of timeline || []) {
    if (!step || typeof step !== 'object') continue;
    const last = groups[groups.length - 1];
    if (last && last.type === step.type) {
      last.steps.push(step);
    } else {
      groups.push({ type: step.type, steps: [step] });
    }
  }
  return groups;
}

/** 列表拼成中文顿号句 */
function joinList(items) {
  return (items || []).join('、');
}

/**
 * 给一段文字加阶段标签，但**避免与文字自带的前缀重复**。
 *
 * 契约样例里 `careerPhases.early` 本身就以「早年」开头、`later` 以「中年后」开头。
 * 若渲染器再补一个「早年：」，散文里就会出现「早年：早年…」这种读着别扭的重复。
 *
 * 规则：文字**已经以该标签开头**时，直接输出原文（不加标签）；否则补「标签：」。
 * 这样两种输入都能读通，且原文一定会完整出现在散文里。
 *
 * @param {string} text 原文
 * @param {string} label 阶段标签，如「早年」「中年后」
 * @returns {string}
 */
function labeled(text, label) {
  const t = (text || '').trim();
  if (!t) return '';
  return t.startsWith(label) ? t : `${label}：${t}`;
}

/**
 * 把符合契约的事业推理 JSON 渲染成散文文档。
 *
 * 段落顺序与契约键序一致；月令与格局合并成一段（对齐《事业推理结果.txt》的 L4）。
 *
 * @param {object} data 符合契约的事业推理 JSON
 * @returns {string} Markdown 散文
 */
function renderCareerProse(data) {
  const out = [];
  const p = (text) => out.push(text);

  // 1. 命例
  const c = data.case || {};
  const pillars = c.pillars || {};
  p(`## ${SECTION_TITLES.case}`);
  p(`${c.gender || ''}命，${pillars.year || ''}年 ${pillars.month || ''}月 ${pillars.day || ''}日 ${pillars.hour || ''}时。`);
  p('');

  // 2. 月令 + 格局（合并成一段）
  const mc = data.monthCommand || {};
  const pt = data.pattern || {};
  p(`## ${SECTION_TITLES.monthCommand}与${SECTION_TITLES.pattern}`);
  p(`月令${mc.monthBranch || ''}，${mc.seasonClimate || ''}；${mc.verdict || ''}。`
    + `格局为${pt.type || ''}，${pt.verdict || ''}；${pt.storeHouse || ''}；${pt.reasoning || ''}。`);
  p('');

  // 3. 格局赛道
  const ptr = data.patternTracks || {};
  p(`## ${SECTION_TITLES.patternTracks}`);
  for (const row of ptr.byPattern || []) {
    if (!row) continue;
    p(`${row.pattern || ''}：${joinList(row.tracks)}；${row.trait || ''}${row.note ? '（' + row.note + '）' : ''}。`);
  }
  for (const row of ptr.byCombination || []) {
    if (!row) continue;
    p(`${row.name || ''}：${joinList(row.tracks)}${row.condition ? '（条件：' + row.condition + '）' : ''}。`);
  }
  p('');

  // 4. 事业阶段
  const cp = data.careerPhases || {};
  p(`## ${SECTION_TITLES.careerPhases}`);
  const earlyText = labeled(cp.early, '早年');
  const laterText = labeled(cp.later, '中年后');
  p([earlyText, laterText].filter(Boolean).join('；') + '。');
  p('');

  // 5. 调候
  const th = data.tiaoHou || {};
  p(`## ${SECTION_TITLES.tiaoHou}`);
  p(`${th.climateType || ''}，调候第一要 ${th.primaryDrug || ''}，次要 ${th.secondaryDrug || ''}；`
    + `药为${th.drugStatus || ''}：${th.drugReasoning || ''}；${th.gap || ''}。`);
  p('');

  // 6. 喜忌
  const xj = data.xiJi || {};
  p(`## ${SECTION_TITLES.xiJi}`);
  p(`喜：${joinList(xj.xi)}；`);
  if ((xj.ciXi || []).length) p(`次喜：${joinList(xj.ciXi)}；`);
  p(`忌：${joinList(xj.ji)}。`);
  p('');

  // 7. 边界
  p(`## ${SECTION_TITLES.boundaries}`);
  for (const row of data.boundaries || []) {
    if (!row) continue;
    p(`不是不能碰${row.element || ''}：${row.why || ''}；${row.condition || ''}。`);
  }
  p('');

  // 8. 方位与行业
  p(`## ${SECTION_TITLES.directions}`);
  for (const row of data.directions || []) {
    if (!row) continue;
    p(`${row.element || ''}（${row.direction || ''}）：${row.coreImage || ''}；`
      + `代表职业 ${joinList(row.careers)}；${row.personality || ''}${row.note ? '（' + row.note + '）' : ''}。`);
  }
  p('');

  // 9. 打法
  p(`## ${SECTION_TITLES.playbooks}`);
  for (const row of data.playbooks || []) {
    if (!row) continue;
    p(`${row.scale || ''}：${row.condition || ''}；${joinList(row.actions)}。`);
  }
  p('');

  // 10. 大运
  p(`## ${SECTION_TITLES.timeline}`);
  for (const group of groupTimelineByType(data.timeline)) {
    const branches = BRANCHES_BY_TYPE[group.type];
    const head = branches ? `${group.type}（${branches}）` : group.type;
    const stepText = group.steps
      .map((s) => `${s.ganZhi || ''}（${s.verdict || ''}，${s.mainTrack || ''}${s.playbook ? '，走' + s.playbook + '档' : ''}）`)
      .join('；');
    p(`${head}：${stepText}。`);
    for (const s of group.steps) {
      for (const w of s.liunianWindows || []) {
        if (!w) continue;
        p(`  - ${w.year}年 ${w.signal || ''}（${w.action || ''}）`);
      }
    }
  }
  p('');

  // 11. 交运
  const tr = data.transition || {};
  p(`## ${SECTION_TITLES.transition}`);
  p(`${tr.risk || ''}；${tr.advice || ''}。`);
  p('');

  // 12. 策略总纲
  const sm = data.summary || {};
  p(`## ${SECTION_TITLES.summary}`);
  p(`${sm.strategy || ''}；${joinList(sm.notes)}。`);

  return out.join('\n');
}

module.exports = { renderCareerProse, groupTimelineByType, BRANCHES_BY_TYPE, SECTION_TITLES };
