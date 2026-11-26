'use strict';

const C = require('../core/constants');
const { PILLAR_KEYS, PILLAR_CN } = require('../core/interactions');
const { computeInteractions } = require('../core/interactions');

/**
 * 旺衰打分。
 *
 * 打分口径（bazica hidden_stems_v1 方案，方案文档 §4）：
 *   - 每个明透天干记 1 分，记到该天干的五行上（日主自身明透也计 1 分，但没有十神）
 *   - 每个地支记 1 分，按藏干权重拆分到各藏干的五行：
 *       单藏 1；双藏 0.7/0.3；三藏 0.6/0.3/0.1
 *   - 依五行汇总成分数，再按阈值 0.5 / 1.5 / 2.5 / 3.5 分 5 档
 *
 * 阈值只作显示约定。身强身弱定论与用神流派分歧大，按方案文档要求留空为 null。
 *
 * @param {object} derived  computeChart 产出的 derived 段
 * @param {string} dayGan   日主天干
 * @returns {object}
 */
function computeStrength(derived, dayGan) {
  const elementScores = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const contributions = [];

  // ---- 明透天干 ----
  for (const key of PILLAR_KEYS) {
    const p = derived[key];
    elementScores[p.ganElement] += 1;
    contributions.push({
      pillar: key, pillarCn: PILLAR_CN[key], source: '天干',
      gan: p.gan, element: p.ganElement, score: 1, shiShen: p.ganShiShen,
    });
  }

  // ---- 地支（按藏干权重拆分）----
  for (const key of PILLAR_KEYS) {
    const p = derived[key];
    for (const h of p.hiddenStems) {
      elementScores[h.element] += h.weight;
      contributions.push({
        pillar: key, pillarCn: PILLAR_CN[key], source: '地支藏干',
        gan: h.gan, element: h.element, score: h.weight,
        role: h.role, shiShen: h.shiShen,
      });
    }
  }

  // ---- 五行分档 ----
  const elementLevels = {};
  for (const el of C.ELEMENTS) {
    elementLevels[el] = {
      score: round2(elementScores[el]),
      level: levelOf(elementScores[el]),
      label: levelLabel(elementScores[el]),
    };
  }

  // ---- 得令 / 得地 / 得势 / 得生 ----
  const interactions = computeInteractions(derived);
  const factors = {
    deLing: judgeDeLing(derived, dayGan),
    deDi: judgeDeDi(derived, dayGan),
    deShi: judgeDeShi(derived, dayGan),
    deSheng: judgeDeSheng(derived, dayGan, interactions),
  };

  // ---- 旺衰倾向（参考值，非定论）----
  const meEl = C.GAN_ELEMENT[dayGan];
  const shiEl = C.SHENG[meEl];        // 食伤（我生）
  const caiEl = C.KE[meEl];           // 财（我克）
  const guanEl = C.KE[shiEl];         // 官杀（克我）
  const yinEl = C.KE[caiEl];          // 印（生我）

  const supportScore = round2(elementScores[meEl] + elementScores[yinEl]);
  const drainScore = round2(elementScores[shiEl] + elementScores[caiEl] + elementScores[guanEl]);
  const tendency = supportScore > drainScore + 1 ? '偏强'
    : supportScore < drainScore - 1 ? '偏弱' : '中和';

  return {
    elementScores,
    elementLevels,
    contributions,
    factors,
    supportScore,
    drainScore,
    tendency,
    dayMasterStrength: null,
    usefulGod: null,
    note: '身强身弱定论与用神流派分歧大，按方案留空；tendency 仅为加权参考，请结合得令/得地/得势/得生四项判读。',
  };
}

/** 阈值分档：0.5 / 1.5 / 2.5 / 3.5 */
function levelOf(score) {
  if (score < 0.5) return 1;
  if (score < 1.5) return 2;
  if (score < 2.5) return 3;
  if (score < 3.5) return 4;
  return 5;
}
function levelLabel(score) {
  return ['极弱', '偏弱', '中和', '偏旺', '极旺'][levelOf(score) - 1];
}

/**
 * 得令：月令本气为比劫或印 → 得令；为官杀/财/食伤 → 失令。
 */
function judgeDeLing(derived, dayGan) {
  const monthZhi = derived.month.zhi;
  const main = derived.month.hiddenStems[0];
  const rel = relationTo(dayGan, main.gan);
  const deLing = rel === '比劫' || rel === '印';
  return {
    value: deLing,
    reason: `月令${monthZhi}本气${main.gan}（${main.element}）与日主为「${rel}」，${deLing ? '得令' : '失令'}`,
    monthZhi,
    mainGan: main.gan,
    relation: rel,
  };
}

/**
 * 得地：日主在四柱地支是否通根（本气根最强，中余气次之）。
 */
function judgeDeDi(derived, dayGan) {
  const roots = [];
  for (const key of PILLAR_KEYS) {
    const p = derived[key];
    for (const h of p.hiddenStems) {
      if (h.element !== C.GAN_ELEMENT[dayGan]) continue;
      const strength = h.role === '本气' ? '本气根' : h.role === '中气' ? '中气根' : '余气根';
      roots.push({
        pillar: key, pillarCn: PILLAR_CN[key], zhi: p.zhi,
        gan: h.gan, role: h.role, strength, weight: h.weight,
      });
    }
  }
  const hasBenQi = roots.some(r => r.role === '本气');
  return {
    value: roots.length > 0,
    reason: roots.length === 0
      ? '四支藏干无日主同类，天干无根'
      : `通根 ${roots.length} 处：${roots.map(r => `${r.pillarCn}${r.zhi}(${r.role})`).join('、')}${hasBenQi ? '；有本气根' : '；无本气根'}`,
    roots,
    hasBenQiRoot: hasBenQi,
  };
}

/**
 * 得势：天干是否有比肩劫财、正印偏印透出生扶。
 */
function judgeDeShi(derived, dayGan) {
  const helpers = [];
  for (const key of PILLAR_KEYS) {
    const p = derived[key];
    // 只有日柱的天干十神为 null（它自己不生扶自己），其余柱同干为比肩，照常计入
    if (!p.ganShiShen) continue;
    if (['比肩', '劫财', '正印', '偏印'].includes(p.ganShiShen)) {
      helpers.push({ pillar: key, pillarCn: PILLAR_CN[key], gan: p.gan, shiShen: p.ganShiShen });
    }
  }
  return {
    value: helpers.length > 0,
    reason: helpers.length === 0
      ? '年月时干无比肩劫财与正偏印透出'
      : `天干透出生扶 ${helpers.length} 处：${helpers.map(h => `${h.pillarCn}${h.gan}(${h.shiShen})`).join('、')}`,
    helpers,
  };
}

/**
 * 得生：印星或比劫存在，且其所在柱未参与天干五合、地支六合或六冲。
 */
function judgeDeSheng(derived, dayGan, interactions) {
  const touched = new Set();
  for (const g of interactions.ganHe) { touched.add(g.from); touched.add(g.to); }
  for (const g of interactions.zhiLiuHe) { touched.add(g.from); touched.add(g.to); }
  for (const g of interactions.zhiLiuChong) { touched.add(g.from); touched.add(g.to); }

  const sources = [];
  for (const key of PILLAR_KEYS) {
    const p = derived[key];
    // 同上：ganShiShen 为 null 只可能是日柱，日主不生助自己
    const rel = p.ganShiShen ? relationTo(dayGan, p.gan) : null;
    const kind = rel === '印' ? '印星' : rel === '比劫' ? '比劫' : null;
    if (!kind) continue;
    sources.push({
      pillar: key, pillarCn: PILLAR_CN[key], gan: p.gan,
      kind, blocked: touched.has(key),
    });
  }
  const effective = sources.filter(s => !s.blocked);
  return {
    value: effective.length > 0,
    reason: sources.length === 0
      ? '无印星比劫可生助'
      : effective.length > 0
        ? `生助有效 ${effective.length} 处：${effective.map(s => `${s.pillarCn}${s.gan}(${s.kind})`).join('、')}`
        : `生助 ${sources.length} 处但所在柱均被合冲，生助受损`,
    sources,
    effective,
  };
}

/** 目标天干相对日主的关系类别：'比劫'|'食伤'|'财'|'官杀'|'印' */
function relationTo(dayGan, otherGan) {
  const meEl = C.GAN_ELEMENT[dayGan];
  const otEl = C.GAN_ELEMENT[otherGan];
  if (meEl === otEl) return '比劫';
  if (C.SHENG[meEl] === otEl) return '食伤';
  if (C.KE[meEl] === otEl) return '财';
  if (C.KE[otEl] === meEl) return '官杀';
  if (C.SHENG[otEl] === meEl) return '印';
  return '比劫';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { computeStrength, relationTo, levelOf, levelLabel };
