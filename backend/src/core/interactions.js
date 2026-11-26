'use strict';

const C = require('./constants');

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];
const PILLAR_CN = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };

/** 地支六破：子酉、丑辰、寅亥、卯午、巳申、未戌 */
const PO_PAIRS = [
  ['子', '酉'], ['丑', '辰'], ['寅', '亥'],
  ['卯', '午'], ['巳', '申'], ['未', '戌'],
];

/**
 * 计算四柱之间的全部干支作用。
 *
 * @param {object} derived  computeChart 产出的 derived 段
 * @returns {object}
 */
function computeInteractions(derived) {
  const ganHe = [];
  const zhiLiuHe = [];
  const zhiLiuChong = [];
  const zhiLiuChuan = [];
  const zhiXing = [];
  const zhiPo = [];
  const fuYin = [];

  for (let i = 0; i < PILLAR_KEYS.length; i++) {
    for (let j = i + 1; j < PILLAR_KEYS.length; j++) {
      const a = derived[PILLAR_KEYS[i]];
      const b = derived[PILLAR_KEYS[j]];
      const pair = {
        from: PILLAR_KEYS[i], to: PILLAR_KEYS[j],
        fromCn: PILLAR_CN[PILLAR_KEYS[i]], toCn: PILLAR_CN[PILLAR_KEYS[j]],
      };

      // 天干五合
      if (C.GAN_HE[a.gan] && C.GAN_HE[a.gan].gan === b.gan) {
        ganHe.push({ ...pair, gan: a.gan + b.gan, element: C.GAN_HE[a.gan].element });
      }

      // 地支六合
      if (C.ZHI_LIU_HE[a.zhi] && C.ZHI_LIU_HE[a.zhi].zhi === b.zhi) {
        zhiLiuHe.push({ ...pair, zhi: a.zhi + b.zhi, element: C.ZHI_LIU_HE[a.zhi].element });
      }

      // 地支六冲
      if (C.ZHI_LIU_CHONG[a.zhi] === b.zhi) {
        zhiLiuChong.push({ ...pair, zhi: a.zhi + b.zhi });
      }

      // 地支六穿（害）
      if (C.ZHI_LIU_CHUAN[a.zhi] === b.zhi) {
        zhiLiuChuan.push({ ...pair, zhi: a.zhi + b.zhi });
      }

      // 地支相刑
      const xing = findXing(a.zhi, b.zhi);
      if (xing) zhiXing.push({ ...pair, zhi: a.zhi + b.zhi, type: xing.type });

      // 地支相破
      if (isPo(a.zhi, b.zhi)) zhiPo.push({ ...pair, zhi: a.zhi + b.zhi });

      // 伏吟：干支完全相同
      if (a.ganZhi === b.ganZhi) fuYin.push({ ...pair, ganZhi: a.ganZhi });
    }
  }

  const zhis = PILLAR_KEYS.map(k => derived[k].zhi);
  const sanHe = findFullGroups(C.SAN_HE_GROUPS, zhis, '三合局');
  const sanHui = findFullGroups(C.SAN_HUI_GROUPS, zhis, '三会方');

  // 三合/三会齐全的柱不再参与半合判定，避免同一组支被重复计算
  const consumed = new Set();
  for (const g of [...sanHe, ...sanHui]) {
    for (const idx of g.pillarIndices) consumed.add(idx);
  }
  const banHe = findBanHe(zhis, consumed);

  return { ganHe, zhiLiuHe, zhiLiuChong, zhiLiuChuan, zhiXing, zhiPo, sanHe, sanHui, banHe, fuYin };
}

/** 两地支之间的刑：返回 {type} 或 null */
function findXing(a, b) {
  if (a === b) return C.ZHI_SELF_XING.includes(a) ? { type: '自刑' } : null;
  for (const g of C.ZHI_XING_GROUPS) {
    if (g.zhis.includes(a) && g.zhis.includes(b)) return { type: g.type };
  }
  return null;
}

function isPo(a, b) {
  return PO_PAIRS.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
}

/**
 * 三合 / 三会：需要三支齐全（来自不同柱）。
 * @param {Array<{zhis:string[], element:string}>} groups
 */
function findFullGroups(groups, zhis, label) {
  const out = [];
  for (const g of groups) {
    const hit = [];
    for (let i = 0; i < zhis.length; i++) {
      if (g.zhis.includes(zhis[i])) {
        hit.push({ zhi: zhis[i], pillar: PILLAR_KEYS[i], pillarCn: PILLAR_CN[PILLAR_KEYS[i]] });
      }
    }
    if (hit.length >= g.zhis.length) {
      const chosen = hit.slice(0, g.zhis.length);
      out.push({
        type: label,
        element: g.element,
        zhis: chosen.map(c => c.zhi).join(''),
        pillars: chosen.map(c => `${c.pillarCn}(${c.zhi})`).join(' + '),
        pillarIndices: chosen.map(c => PILLAR_KEYS.indexOf(c.pillar)),
      });
    }
  }
  return out;
}

/**
 * 半合：8 组（申子/亥卯/寅午/巳酉 生地；子辰/卯未/午戌/酉丑 墓地）。
 * 两柱地支各占一组中的一支即成立。
 *
 * @param {string[]} zhis 四柱地支
 * @param {Set<number>} consumed 已被三合/三会占用的柱下标，这些柱不再参与半合
 */
function findBanHe(zhis, consumed = new Set()) {
  const out = [];
  const taken = new Set();
  for (const g of C.BAN_HE_GROUPS) {
    for (let i = 0; i < zhis.length; i++) {
      if (!g.zhis.includes(zhis[i])) continue;
      if (consumed.has(i)) continue;
      for (let j = i + 1; j < zhis.length; j++) {
        if (!g.zhis.includes(zhis[j])) continue;
        if (consumed.has(j)) continue;
        if (zhis[i] === zhis[j]) continue; // 同支不算半合
        if (taken.has(i) || taken.has(j)) continue;
        taken.add(i); taken.add(j);
        out.push({
          type: '半合',
          subType: g.type,
          element: g.element,
          zhis: zhis[i] + zhis[j],
          pillars: `${PILLAR_CN[PILLAR_KEYS[i]]}(${zhis[i]}) + ${PILLAR_CN[PILLAR_KEYS[j]]}(${zhis[j]})`,
        });
      }
    }
  }
  return out;
}

module.exports = { computeInteractions, PILLAR_KEYS, PILLAR_CN, PO_PAIRS };
