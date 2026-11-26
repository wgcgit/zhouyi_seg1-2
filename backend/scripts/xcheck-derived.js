'use strict';

const { LunarUtil } = require('lunar-javascript');
const D = require('../src/core/derived');
const C = require('../src/core/constants');

let bad = 0;
const NAYIN_ALIAS = { '佛灯火': '覆灯火' };
const aliasHit = [];
const report = [];

// 1. 十神：全 100 组对比
for (const me of C.GAN) {
  for (const ot of C.GAN) {
    const mine = D.tenGod(me, ot);
    const lib = LunarUtil.SHI_SHEN[me + ot];
    if (mine !== lib) { bad++; report.push(`十神 ${me}${ot}: mine=${mine} lib=${lib}`); }
  }
}

// 2. 藏干：全 12 地支对比
for (const z of C.ZHI) {
  const mine = D.hiddenStems(z).map(h => h.gan).join(',');
  const lib = LunarUtil.ZHI_HIDE_GAN[z].join(',');
  if (mine !== lib) { bad++; report.push(`藏干 ${z}: mine=${mine} lib=${lib}`); }
}

// 3. 十二长生：10 日主 × 12 地支对比
// 库语义（lunar.js _getDiShi）：index = CHANG_SHENG_OFFSET[gan] + (阳 ? zhiIndex : -zhiIndex)，zhiIndex 为 0 基
function libChangSheng(gan, zhi) {
  const offset = LunarUtil.CHANG_SHENG_OFFSET[gan];
  const yang = C.GAN.indexOf(gan) % 2 === 0;
  const z0 = C.ZHI.indexOf(zhi);
  let index = offset + (yang ? z0 : -z0);
  if (index >= 12) index -= 12;
  if (index < 0) index += 12;
  return LunarUtil.CHANG_SHENG[index];
}
for (const g of C.GAN) {
  for (const z of C.ZHI) {
    const mine = D.changSheng(g, z);
    const lib = libChangSheng(g, z);
    if (mine !== lib) { bad++; report.push(`长生 ${g}${z}: mine=${mine} lib=${lib}`); }
  }
}

// 4. 纳音：全 60 组
for (const jz of C.JIA_ZI) {
  const mine = D.naYin(jz);
  const lib = LunarUtil.NAYIN[jz];
  if (mine !== lib) { bad++; report.push(`纳音 ${jz}: mine=${mine} lib=${lib}`); }
}

// 5. 空亡：全 60 组
for (const jz of C.JIA_ZI) {
  const mine = D.xunKong(jz).join('');
  const lib = LunarUtil.getXunKong(jz);
  if (mine !== lib) { bad++; report.push(`空亡 ${jz}: mine=${mine} lib=${lib}`); }
}

console.log('mismatches:', bad);
console.log(report.slice(0, 30).join('\n') || '(全部一致)');
