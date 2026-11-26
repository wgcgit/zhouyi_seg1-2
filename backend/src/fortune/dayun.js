'use strict';

const { Solar, EightChar, LunarUtil } = require('lunar-javascript');
const C = require('../core/constants');
const { tenGod, changSheng } = require('../core/derived');

/**
 * 大运 / 流年 / 流月 / 流日。
 *
 * 排运口径（方案文档 §6）：
 *   - 方向：阳男阴女顺排，阴男阳女逆排（看年干阴阳，不是日干）
 *   - 起运：顺行数到下一个「节」，逆行数到上一个「节」；三天折一岁
 *   - 第 0 步为空（出生到起运前，出生月柱本身），第 1 步起为正式大运，每步 10 年
 *
 * 历法交给库：起运折算由 lunar-javascript 的 Yun/DaYun 完成，
 * 本模块负责把它翻译成中文结构化输出，并补上十神、十二长生、虚岁等派生信息。
 */

/**
 * @param {object} chart  computeChart 的返回值
 * @param {object} [options]
 * @param {number} [options.qiyunMethod] 1 = 三天折一岁（默认），2 = 精确到分钟折算
 * @returns {object}
 */
function computeFortune(chart, options = {}) {
  const qiyunMethod = options.qiyunMethod || chart.options.qiyunMethod || 1;
  const gender = chart.input.gender === 'male' ? 1 : 0;
  const ec = chart._ec;
  const dayGan = chart.dayMaster.gan;

  const yun = ec.getYun(gender, qiyunMethod);
  const daYunList = yun.getDaYun();

  const dayun = daYunList.map((dy) => {
    const ganzhi = dy.getGanZhi();
    const item = {
      index: dy.getIndex(),
      // 第 0 步为空串：出生到起运前，出生月柱本身
      ganZhi: ganzhi || null,
      gan: ganzhi ? ganzhi[0] : null,
      zhi: ganzhi ? ganzhi[1] : null,
      startYear: dy.getStartYear(),
      endYear: dy.getEndYear(),
      startAge: dy.getStartAge(),
      endAge: dy.getEndAge(),
      isPrefixed: dy.getIndex() === 0,
    };
    if (ganzhi) {
      item.ganShiShen = tenGod(dayGan, ganzhi[0]);
      item.changSheng = changSheng(dayGan, ganzhi[1]);
      item.naYin = LunarUtil.NAYIN[ganzhi];
    }
    return item;
  });

  const startSolar = yun.getStartSolar();
  const yang = chart.derived.year.ganYinYang === '阳';
  const male = chart.input.gender === 'male';

  return {
    direction: yun.isForward() ? '顺排' : '逆排',
    forward: yun.isForward(),
    directionReason: yun.isForward()
      ? (yang ? '阳男顺排' : '阴女顺排')
      : (yang ? '阳女逆排' : '阴男逆排'),
    startAge: {
      year: yun.getStartYear(),
      month: yun.getStartMonth(),
      day: yun.getStartDay(),
      hour: yun.getStartHour(),
    },
    startDate: `${startSolar.getYear()}-${String(startSolar.getMonth()).padStart(2, '0')}-${String(startSolar.getDay()).padStart(2, '0')}`,
    method: qiyunMethod === 1
      ? '三天折一岁（1天=4月，1时辰=10天）'
      : '精确分钟折算（4320分钟=1年）',
    dayun,
    liunian: computeLiuNian(chart, dayGan, dayun),
  };
}

/**
 * 流年：从出生年起，按立春换年逐年推出，共 100 年。
 *
 * 冲太岁口径：本模块以「日支」为太岁基准（与 bazica GetAnnualPillars 一致），
 * 流年地支与日支相冲为「冲太岁」；另单列「本命年」（流年地支与年支相同）。
 */
function computeLiuNian(chart, dayGan, dayun) {
  // 虚岁基准必须与大运表一致。
  //
  // 大运的 startYear/startAge 由 lunar-javascript 的 buildDaYun 算出，基准是
  // 「真太阳时校正后的公历年」（lunar.js: var birthYear = yun.getLunar().getSolar().getYear()）。
  // 这里如果用挂钟年 chart.input.year，真太阳时跨年的出生会让同一年的虚岁
  // 在两张表里差 1（如乌鲁木齐 1990-01-01 01:00 校正到 1989-12-31），
  // 而且本命年那一行会落在流年表范围之外。
  const birthYear = chart._ec.getLunar().getSolar().getYear();
  const dayZhi = chart.derived.day.zhi;
  const yearZhi = chart.derived.year.zhi;
  const out = [];
  for (let y = birthYear; y < birthYear + 100; y++) {
    const gz = yearGanZhi(y);
    const step = dayun.find(d => y >= d.startYear && y <= d.endYear);
    out.push({
      year: y,
      ganZhi: gz,
      gan: gz[0],
      zhi: gz[1],
      ganShiShen: tenGod(dayGan, gz[0]),
      changSheng: changSheng(dayGan, gz[1]),
      age: y - birthYear + 1,        // 虚岁
      dayunIndex: step ? step.index : null,
      dayunGanZhi: step ? step.ganZhi : null,
      chongTaiSui: C.ZHI_LIU_CHONG[gz[1]] === dayZhi,
      benMingNian: gz[1] === yearZhi,
    });
  }
  return out;
}

/**
 * 某公历年（以立春换年）的年柱干支。
 * 取当年 6 月 1 日 12:00 排盘——此时必在立春之后、下一立春之前。
 */
function yearGanZhi(year) {
  const ec = EightChar.fromLunar(Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar());
  return ec.getYear();
}

/**
 * 流月：某流年十二个月的月柱（以「节」换月，五虎遁定月干）。
 *
 * 辅助函数：不在命盘 JSON 的契约里（契约里 fortune 只有 7 个键，其中没有流月/流日）。
 * plan 的 Task 9 要求实现并测试它们，所以保留；tests/fortune.test.js 用
 * lunar-javascript 自己的流月逐年交叉校验这个手写的五虎遁表。
 *
 * @param {number} year 流年（立春换年）
 * @param {number} monthIndex 0–11，对应寅月起
 */
function liuYueGanZhi(year, monthIndex) {
  const yearGz = yearGanZhi(year);
  const yearGanIndex = C.GAN.indexOf(yearGz[0]);
  const firstGan = [2, 4, 6, 8, 0][yearGanIndex % 5];   // 甲己之年丙作首
  const gan = C.GAN[(firstGan + monthIndex) % 10];
  const zhi = C.ZHI[(monthIndex + 2) % 12];
  return gan + zhi;
}

/**
 * 流日：某流年某流月的日柱（六十甲子逐日 + 1，与日柱同制）。
 *
 * 辅助函数：不在命盘 JSON 的契约里（契约里 fortune 只有 7 个键，其中没有流月/流日）。
 * plan 的 Task 9 要求实现并测试它们，所以保留。
 */
function liuRiGanZhi(year, month, day) {
  const ec = EightChar.fromLunar(Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar());
  ec.setSect(1);
  return ec.getDay();
}

module.exports = { computeFortune, computeLiuNian, yearGanZhi, liuYueGanZhi, liuRiGanZhi };
