'use strict';

const C = require('../core/constants');
const { PILLAR_KEYS, PILLAR_CN } = require('../core/interactions');
const { relationTo } = require('./strength');
const { tenGod } = require('../core/derived');

/**
 * 格局候选。
 *
 * 取格十六字口诀：月令为纲、透干优先、本气为主、杂气看透（方案文档 §5）。
 *
 * 实现口径：
 *   1. 定月令地支 → 列出藏干（本气/中气/余气）
 *   2. 看藏干是否在天干（年/月/时干）透出；透出者优先取该藏干十神为格
 *   3. 未透则取本气为格；辰戌丑未杂气月按透出深浅取
 *   4. 比劫不立正格，另立建禄格 / 月劫格 / 阳刃格
 *   5. 不自动处理合化、不自动定最终格局与用神，只输出候选 + 提示
 *
 * @param {object} derived  computeChart 产出的 derived 段
 * @param {string} dayGan   日主天干
 * @returns {object}
 */
function computePattern(derived, dayGan) {
  const monthZhi = derived.month.zhi;
  const monthHidden = derived.month.hiddenStems;
  const isZaQi = ['辰', '戌', '丑', '未'].includes(monthZhi);
  const luShen = C.LU_SHEN[dayGan];
  const yangRen = C.YANG_REN[dayGan];

  // 透干位置（不含日干：日干是日主本身，不算透出）
  const throughMap = {};
  for (const key of ['year', 'month', 'hour']) {
    const p = derived[key];
    if (!throughMap[p.gan]) throughMap[p.gan] = [];
    throughMap[p.gan].push({ pillar: key, pillarCn: PILLAR_CN[key] });
  }

  const candidates = [];

  // ---- 比劫三格：先判月支位置，再判本气 ----
  const mainHidden = monthHidden[0];
  const mainShiShen = tenGod(dayGan, mainHidden.gan);
  if (monthZhi === luShen) {
    candidates.push({
      name: '建禄格', category: '比劫格', monthZhi,
      hiddenStem: mainHidden.gan, hiddenRole: mainHidden.role, shiShen: mainShiShen,
      through: (throughMap[mainHidden.gan] || []).map(t => t.pillarCn),
      reason: `月支${monthZhi}为日主${dayGan}之临官（禄），建禄格成立`,
      confidence: 'high',
    });
  } else if (monthZhi === yangRen) {
    candidates.push({
      name: '阳刃格', category: '比劫格', monthZhi,
      hiddenStem: mainHidden.gan, hiddenRole: mainHidden.role, shiShen: mainShiShen,
      through: (throughMap[mainHidden.gan] || []).map(t => t.pillarCn),
      reason: `月支${monthZhi}为日主${dayGan}之帝旺（羊刃），阳刃格成立`,
      confidence: 'high',
    });
  } else if (mainShiShen === '劫财') {
    candidates.push({
      name: '月劫格', category: '比劫格', monthZhi,
      hiddenStem: mainHidden.gan, hiddenRole: mainHidden.role, shiShen: mainShiShen,
      through: (throughMap[mainHidden.gan] || []).map(t => t.pillarCn),
      reason: `月令${monthZhi}本气${mainHidden.gan}为劫财，比劫不立正格，取月劫格`,
      confidence: 'high',
    });
  }

  // ---- 正格候选：逐个藏干看透干 ----
  for (const h of monthHidden) {
    const shiShen = tenGod(dayGan, h.gan);
    if (['比肩', '劫财'].includes(shiShen)) continue; // 比劫已由上面三格覆盖

    const rel = relationTo(dayGan, h.gan);
    const through = throughMap[h.gan] || [];
    const isMain = h.role === '本气';

    candidates.push({
      name: shiShen + '格', category: '正格', monthZhi,
      hiddenStem: h.gan, hiddenRole: h.role, shiShen,
      through: through.map(t => t.pillarCn),
      reason: through.length
        ? `月令${monthZhi}${h.role}${h.gan}（${rel}）透于${through.map(t => t.pillarCn).join('、')}，透干优先取${shiShen}格`
        : `月令${monthZhi}${h.role}${h.gan}（${rel}）未透干，取${shiShen}格（本气为主）`,
      confidence: through.length ? 'high' : (isMain ? 'medium' : 'low'),
    });
  }

  // 排序：high → medium → low，同档保持月令藏干顺序
  const order = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return {
    candidates,
    monthZhi,
    monthHidden: monthHidden.map(h => ({
      gan: h.gan, element: h.element, role: h.role,
      shiShen: h.shiShen, relation: relationTo(dayGan, h.gan),
    })),
    isZaQiMonth: isZaQi,
    finalPattern: null,
    note: isZaQi
      ? '月令为杂气月（辰戌丑未），格局需按透干深浅细分，以上为候选。'
      : '以上为格局候选，最终格局与用神按方案留空，请结合旺衰与合化情况判读。',
  };
}

module.exports = { computePattern };
