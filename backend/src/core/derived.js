'use strict';

const C = require('./constants');

// ---- 基础查表 ----

function ganIndex(gan) {
  const i = C.GAN.indexOf(gan);
  if (i < 0) throw new Error('未知天干: ' + gan);
  return i;
}

function zhiIndex(zhi) {
  const i = C.ZHI.indexOf(zhi);
  if (i < 0) throw new Error('未知地支: ' + zhi);
  return i;
}

/** 天干阴阳：阳干（甲丙戊庚壬）为 '阳'，阴干为 '阴' */
function ganYinYang(gan) {
  return ganIndex(gan) % 2 === 0 ? '阳' : '阴';
}

/** 地支阴阳：子寅辰午申戌为 '阳'，丑卯巳未酉亥为 '阴' */
function zhiYinYang(zhi) {
  return zhiIndex(zhi) % 2 === 0 ? '阳' : '阴';
}

/** 某地支的藏干（带角色与权重） */
function hiddenStems(zhi) {
  const gans = C.HIDDEN_STEMS[zhi];
  if (!gans) throw new Error('未知地支: ' + zhi);
  const weights = C.HIDDEN_WEIGHTS[gans.length];
  const roles = C.HIDDEN_ROLES[gans.length];
  return gans.map((gan, i) => ({
    gan,
    element: C.GAN_ELEMENT[gan],
    role: roles[i],
    weight: weights[i],
  }));
}

/**
 * 十神：以日主为「我」，看 other 相对我的五行生克 + 阴阳同异。
 * @param {string} dayGan 日主天干
 * @param {string} other  目标天干
 * @returns {string} 十神名
 */
function tenGod(dayGan, other) {
  const meEl = C.GAN_ELEMENT[dayGan];
  const otEl = C.GAN_ELEMENT[other];
  const samePolarity = ganYinYang(dayGan) === ganYinYang(other);

  if (meEl === otEl) return samePolarity ? '比肩' : '劫财';
  if (C.SHENG[meEl] === otEl) return samePolarity ? '食神' : '伤官'; // 我生
  if (C.KE[meEl] === otEl) return samePolarity ? '偏财' : '正财';   // 我克
  if (C.KE[otEl] === meEl) return samePolarity ? '七杀' : '正官';   // 克我
  if (C.SHENG[otEl] === meEl) return samePolarity ? '偏印' : '正印'; // 生我
  throw new Error('无法判定十神: ' + dayGan + ' / ' + other);
}

/**
 * 十二长生：日主天干在某地支的状态。
 * 阳干顺排、阴干逆行；戊随丙、己随丁。
 */
function changSheng(dayGan, zhi) {
  const start = C.CHANG_SHENG_START[dayGan];
  if (start === undefined) throw new Error('未知天干: ' + dayGan);
  const forward = ganYinYang(dayGan) === '阳';
  const offset = forward
    ? (zhiIndex(zhi) - start + 12) % 12
    : (start - zhiIndex(zhi) + 12) % 12;
  return C.CHANG_SHENG_STATES[offset];
}

/** 纳音：干支两字查 30 项表（每两柱共用一项） */
function naYin(ganZhi) {
  const idx = C.JIA_ZI.indexOf(ganZhi);
  if (idx < 0) throw new Error('未知干支: ' + ganZhi);
  return C.NAYIN_30[Math.floor(idx / 2)];
}

/** 空亡：干支查旬空两支 */
function xunKong(ganZhi) {
  const idx = C.JIA_ZI.indexOf(ganZhi);
  if (idx < 0) throw new Error('未知干支: ' + ganZhi);
  const xunHead = C.JIA_ZI[Math.floor(idx / 10) * 10];
  return C.XUN_KONG[xunHead].slice();
}

/**
 * 一柱的完整派生信息。
 *
 * ⚠️ 注意第三个参数的默认值：`isDayPillar = true` 表示「按日柱处理」，
 *    日柱的天干十神恒为 null（日干即日主，不与自己论十神）。
 *    **新增调用点必须显式传参**：漏传会把该柱的天干十神静默置成 null，
 *    既不报错也不抛异常，排查起来非常费时间。
 *    （默认值本身是 plan 明确要求的签名，不能改，只能靠调用点显式传参。）
 *
 * @param {string} ganZhi  干支两字，如 '庚午'
 * @param {string} dayGan  日主天干
 * @param {boolean} isDayPillar 这一柱是不是日柱。默认 true，
 *        即「不传第三个参数时按日柱处理」——保持旧的调用语义不变。
 */
function derivePillar(ganZhi, dayGan, isDayPillar = true) {
  if (ganZhi.length !== 2) throw new Error('干支必须是两个字: ' + ganZhi);
  const gan = ganZhi[0];
  const zhi = ganZhi[1];
  const hStems = hiddenStems(zhi);
  return {
    ganZhi,
    gan,
    zhi,
    ganElement: C.GAN_ELEMENT[gan],
    zhiElement: C.ZHI_ELEMENT[zhi],
    ganYinYang: ganYinYang(gan),
    zhiYinYang: zhiYinYang(zhi),
    // 藏干十神恒有值：日主同干的藏干是比肩（方案文档 §3.2 无例外）
    hiddenStems: hStems.map(h => ({
      ...h,
      shiShen: tenGod(dayGan, h.gan),
    })),
    // 天干十神：只有日柱那一个天干自身不标十神；其余柱同干为比肩
    ganShiShen: (isDayPillar && gan === dayGan) ? null : tenGod(dayGan, gan),
    changSheng: changSheng(dayGan, zhi),
    naYin: naYin(ganZhi),
    xunKong: xunKong(ganZhi),
  };
}

module.exports = {
  ganIndex, zhiIndex, ganYinYang, zhiYinYang,
  hiddenStems, tenGod, changSheng, naYin, xunKong, derivePillar,
};
