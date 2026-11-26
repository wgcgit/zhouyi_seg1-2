'use strict';

const C = require('./constants');
const { PILLAR_KEYS, PILLAR_CN } = require('./interactions');

/**
 * 计算神煞。lunar-javascript 未暴露八字神煞（只有黄历用的 SHEN_SHA），
 * 因此本模块自建查表，规则来源与 v1 的 skills/bazi-tuipan 保持一致。
 *
 * 查表口径（行业通行）：
 *   天乙贵人 —— 按日干查（兼看年干），落四柱地支
 *   文昌       —— 按日干查，落四柱地支
 *   禄神       —— 按日干查（临官位），落四柱地支
 *   羊刃       —— 按日干查（帝旺位），落四柱地支
 *   桃花/驿马/华盖 —— 按年支与日支三合局查，落四柱地支
 *
 * @param {object} derived  computeChart 产出的 derived 段
 * @param {string} dayGan   日主天干
 * @returns {object}
 */
function computeShenSha(derived, dayGan) {
  const yearGan = derived.year.gan;
  const yearZhi = derived.year.zhi;
  const dayZhi = derived.day.zhi;

  const shensha = {
    tianYiGuiRen: [],
    wenChang: [],
    luShen: [],
    yangRen: [],
    taoHua: [],
    yiMa: [],
    huaGai: [],
  };

  for (const key of PILLAR_KEYS) {
    const zhi = derived[key].zhi;
    const pillarCn = PILLAR_CN[key];

    // 天乙贵人：日干 + 年干 两路都查；同一柱只记一次，日干优先
    const tygrSeen = new Set();
    for (const [base, label] of [[dayGan, '日干'], [yearGan, '年干']]) {
      const targets = C.TIAN_YI_GUI_REN[base];
      if (targets && targets.includes(zhi)) {
        if (tygrSeen.has(zhi)) continue;
        tygrSeen.add(zhi);
        shensha.tianYiGuiRen.push({ pillar: key, pillarCn, zhi, basedOn: label, baseGan: base });
      }
    }

    if (C.WEN_CHANG[dayGan] === zhi) {
      shensha.wenChang.push({ pillar: key, pillarCn, zhi, basedOn: '日干', baseGan: dayGan });
    }
    if (C.LU_SHEN[dayGan] === zhi) {
      shensha.luShen.push({ pillar: key, pillarCn, zhi, basedOn: '日干', baseGan: dayGan });
    }
    if (C.YANG_REN[dayGan] === zhi) {
      shensha.yangRen.push({ pillar: key, pillarCn, zhi, basedOn: '日干', baseGan: dayGan });
    }

    // 桃花 / 驿马 / 华盖：年支、日支两路；同一柱同一神煞只记一次，年支优先
    const seen = { taoHua: new Set(), yiMa: new Set(), huaGai: new Set() };
    for (const [base, label] of [[yearZhi, '年支'], [dayZhi, '日支']]) {
      const pushes = [
        ['taoHua', C.TAO_HUA[base] === zhi],
        ['yiMa', C.YI_MA[base] === zhi],
        ['huaGai', C.HUA_GAI[base] === zhi],
      ];
      for (const [name, hit] of pushes) {
        if (!hit) continue;
        if (seen[name].has(zhi)) continue;
        seen[name].add(zhi);
        shensha[name].push({ pillar: key, pillarCn, zhi, basedOn: label, baseZhi: base });
      }
    }
  }

  return shensha;
}

module.exports = { computeShenSha };
