'use strict';

/**
 * 校验并归一化排盘请求体。
 * paipan（离线排盘）与 interpret（LLM 解读）两个路由共用，保证同一参数行为一致。
 */

/** 公历闰年判定 */
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 某年某月的天数 */
function daysInMonth(y, m) {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeapYear(y)) return 29;
  return table[m - 1];
}

/**
 * 原始值必须是 number 或纯数字字符串。
 *
 * 不能直接用 Number(v)：Number([1990]) === 1990，
 * 数组会蒙混过关地通过整数校验。布尔、对象同理。
 */
function isPlainNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return /^\d+$/.test(v);
  return false;
}

/** 原始值合法时转成数字，否则返回 NaN（后续整数校验会拦掉） */
function toNumber(v) {
  return isPlainNumeric(v) ? Number(v) : NaN;
}

function normalizeInput(body) {
  const errors = [];
  const gender = body.gender === '女' || body.gender === 'female' ? 'female'
    : body.gender === '男' || body.gender === 'male' ? 'male' : null;
  if (!gender) errors.push('gender 必须是 男/male 或 女/female');

  const rawYear = body.year;
  const rawMonth = body.month;
  const rawDay = body.day;
  const rawHour = body.hour;
  const rawMinute = body.minute;
  const rawSecond = body.second;

  const year = toNumber(rawYear);
  const month = toNumber(rawMonth);
  const day = toNumber(rawDay);
  const hour = toNumber(rawHour);
  // minute / second 允许 undefined 与空串（视作 0）
  const minute = rawMinute === undefined || rawMinute === '' ? 0 : toNumber(rawMinute);
  const second = rawSecond === undefined || rawSecond === '' ? 0 : toNumber(rawSecond);

  if (!Number.isInteger(year) || year < 1900 || year > 2100) errors.push('year 必须是 1900–2100 之间的整数');
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('month 必须是 1–12');
  if (Number.isInteger(day) && Number.isInteger(year) && Number.isInteger(month) &&
      month >= 1 && month <= 12) {
    // 按公历闰年规则算当月实际天数：2 月 31 日这类输入必须被拦掉，
    // 否则 lunar-javascript 会静默顺延成 3 月 2 日，返回一份看起来权威的错命盘。
    const maxDay = daysInMonth(year, month);
    if (day < 1 || day > maxDay) {
      errors.push(`day 不是 ${year} 年 ${month} 月的有效日期（1–${maxDay}）`);
    }
  } else if (!Number.isInteger(day) || day < 1 || day > 31) {
    errors.push('day 必须是 1–31');
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) errors.push('hour 必须是 0–23');
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) errors.push('minute 必须是 0–59');
  if (!Number.isInteger(second) || second < 0 || second > 59) errors.push('second 必须是 0–59');

  // 姓名与省市的长度、类型限制。
  //
  // 前端的 maxlength 只在浏览器端生效，服务端可以塞进几百 KB 的字符串：
  // 命盘 JSON 会整份发给大模型（按量计费），超长输入必须直接被 400 挡掉。
  // 这几个检查必须在下面 `if (errors.length)` 之前完成。
  //
  // 报错回显（core/pillars.js 的「查不到城市经纬度」）也因此天然被限制在 32 字符内，
  // 不需要再加截断逻辑。
  const MAX_TEXT_LEN = 32;
  if (body.name === undefined || body.name === null || body.name === '') {
    // 姓名可空，不报错
  } else if (typeof body.name !== 'string') {
    errors.push('name 必须是字符串');
  } else if (body.name.length > MAX_TEXT_LEN) {
    errors.push(`name 长度不能超过 ${MAX_TEXT_LEN} 个字符`);
  }
  if (body.province === undefined || body.province === null || body.province === '') {
    errors.push('province 必填');
  } else if (typeof body.province !== 'string') {
    errors.push('province 必须是字符串');
  } else if (body.province.length > MAX_TEXT_LEN) {
    errors.push(`province 长度不能超过 ${MAX_TEXT_LEN} 个字符`);
  }
  if (body.city === undefined || body.city === null || body.city === '') {
    errors.push('city 必填');
  } else if (typeof body.city !== 'string') {
    errors.push('city 必须是字符串');
  } else if (body.city.length > MAX_TEXT_LEN) {
    errors.push(`city 长度不能超过 ${MAX_TEXT_LEN} 个字符`);
  }

  if (errors.length) return { errors };

  return {
    input: {
      name: typeof body.name === 'string' ? body.name : '',
      gender,
      year, month, day, hour, minute, second,
      province: body.province,
      city: body.city,
    },
  };
}

module.exports = { normalizeInput, isLeapYear, daysInMonth };
