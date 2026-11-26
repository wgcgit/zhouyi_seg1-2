'use strict';

/* eslint-env browser */

// ---- 城市下拉 ----
const CITIES = {};   // { 省: [市, ...] }

// 页面初始化时的默认出生地。
// 姓名/性别/出生日期时间的默认值写在 index.html 的 value 属性里；
// 省市是下拉框、要等城市表加载完才能选中，所以放在这里。
const DEFAULT_PROVINCE = '北京市';
const DEFAULT_CITY = '东城区';

async function loadCities() {
  const res = await fetch('/api/paipan/cities');
  const json = await res.json();
  // 后端返回 "省|市" 列表，这里转成省市联动结构
  for (const key of json.cities) {
    const [province, city] = key.split('|');
    (CITIES[province] = CITIES[province] || []).push(city);
  }
  const provinceSel = document.getElementById('province');
  provinceSel.innerHTML = '';
  for (const p of Object.keys(CITIES)) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    provinceSel.appendChild(opt);
  }
  // 先选默认省份，再按它填城市列表，最后选默认城市
  if (DEFAULT_PROVINCE) provinceSel.value = DEFAULT_PROVINCE;
  fillCities();
  const citySel = document.getElementById('city');
  for (const opt of citySel.options) {
    if (opt.value === DEFAULT_CITY) {
      citySel.value = DEFAULT_CITY;
      break;
    }
  }
}

function fillCities() {
  const province = document.getElementById('province').value;
  const citySel = document.getElementById('city');
  citySel.innerHTML = '';
  for (const c of (CITIES[province] || [])) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    citySel.appendChild(opt);
  }
}

// ---- 收集表单 ----
function collectForm() {
  const [y, m, d] = document.getElementById('birthDate').value.split('-').map(Number);
  const [hh, mm] = document.getElementById('birthTime').value.split(':').map(Number);
  return {
    name: document.getElementById('name').value.trim(),
    gender: document.getElementById('gender').value,
    year: y, month: m, day: d, hour: hh, minute: mm, second: 0,
    province: document.getElementById('province').value,
    city: document.getElementById('city').value,
    trueSolarTime: document.getElementById('trueSolarTime').checked,
    dayBoundary: document.getElementById('dayBoundary').checked ? 1 : 2,
  };
}

function setMsg(text, isError) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'msg error' : 'msg';
}

// ---- 渲染 ----
function renderPillars(chart) {
  const order = [
    ['year', '年柱'], ['month', '月柱'], ['day', '日柱'], ['hour', '时柱'],
  ];
  document.getElementById('pillars').innerHTML = order.map(([k, label]) => {
    const d = chart.derived[k];
    const god = d.ganShiShen ? `（${d.ganShiShen}）` : '（日主）';
    return `<div class="glass-card rounded-lg p-stack-gap-sm text-center">
      <div class="font-label-sm text-label-sm text-on-surface-variant">${esc(label)}</div>
      <div class="font-headline-lg text-headline-lg text-primary my-unit">${esc(d.ganZhi)}</div>
      <div class="text-body-md text-on-surface">${esc(d.gan)}${esc(god)} · ${esc(d.zhi)}</div>
      <div class="font-label-sm text-label-sm text-on-surface-variant">${esc(d.naYin)} · ${esc(d.changSheng)}</div>
    </div>`;
  }).join('');
}

function table(headers, rows) {
  if (!rows.length) return '<p class="msg">无</p>';
  const th = headers.map(h => `<th class="py-2 pr-4 text-left text-on-surface-variant font-label-sm">${esc(h)}</th>`).join('');
  const tr = rows.map(r => `<tr class="border-b border-outline-variant/30">${r.map(c => `<td class="py-2 pr-4 text-on-surface">${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="overflow-x-auto"><table class="w-full min-w-[640px] text-sm"><thead><tr class="border-b border-outline-variant">${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function renderDerived(chart) {
  const rows = [];
  for (const [k, label] of [['year', '年柱'], ['month', '月柱'], ['day', '日柱'], ['hour', '时柱']]) {
    const d = chart.derived[k];
    rows.push([
      label, d.ganZhi,
      d.hiddenStems.map(h => `${h.gan}(${h.role}${h.shiShen ? ' ' + h.shiShen : ''})`).join(' '),
      d.ganShiShen || '日主',
      d.naYin, d.changSheng, d.xunKong.join(''),
    ]);
  }
  document.getElementById('derived').innerHTML =
    table(['柱位', '干支', '藏干(十神)', '天干十神', '纳音', '十二长生', '旬空'], rows);
}

function renderInteractions(chart) {
  const it = chart.interactions;
  const rows = [];
  // 「涉及柱」有两种来源：两两作用（天干五合、地支六冲…伏吟）有 fromCn/toCn；
  // 组合成局（三合局、三会方、半合）一次涉及多柱，只有 pillars，没有 fromCn/toCn。
  const involved = (x) =>
    (x.fromCn && x.toCn) ? `${x.fromCn} → ${x.toCn}` : (x.pillars || '');
  const push = (name, list, fmt) => {
    for (const x of list) rows.push([name, fmt(x), involved(x)]);
  };
  push('天干五合', it.ganHe, x => `${x.gan} 合 ${x.element}`);
  push('地支六合', it.zhiLiuHe, x => `${x.zhi} 合 ${x.element}`);
  push('地支六冲', it.zhiLiuChong, x => x.zhi);
  push('地支六穿', it.zhiLiuChuan, x => x.zhi);
  push('地支相刑', it.zhiXing, x => `${x.zhi}（${x.type}）`);
  push('地支相破', it.zhiPo, x => x.zhi);
  push('三合局', it.sanHe, x => `${x.zhis}（${x.element}）`);
  push('三会方', it.sanHui, x => `${x.zhis}（${x.element}）`);
  push('半合', it.banHe, x => `${x.zhis}（${x.subType}·${x.element}）`);
  push('伏吟', it.fuYin, x => x.ganZhi);
  document.getElementById('interactions').innerHTML =
    table(['类型', '组合', '涉及柱'], rows);
}

function renderShensha(chart) {
  const names = {
    tianYiGuiRen: '天乙贵人', wenChang: '文昌', luShen: '禄神', yangRen: '羊刃',
    taoHua: '桃花', yiMa: '驿马', huaGai: '华盖',
  };
  const rows = [];
  for (const [key, label] of Object.entries(names)) {
    for (const x of chart.shensha[key]) {
      rows.push([label, x.pillarCn, x.zhi, x.basedOn]);
    }
  }
  document.getElementById('shensha').innerHTML = table(['神煞', '柱位', '地支', '依据'], rows);
}

function renderAnalysis(chart) {
  const s = chart.strength;
  const p = chart.pattern;
  const elRows = Object.entries(s.elementLevels).map(([el, v]) => [el, v.score, v.label]);
  const facRows = Object.entries(s.factors).map(([k, v]) => [
    { deLing: '得令', deDi: '得地', deShi: '得势', deSheng: '得生' }[k] || k,
    v.value ? '是' : '否', v.reason,
  ]);
  const patRows = p.candidates.map(c => [c.name, c.shiShen, c.through.join('/') || '—', c.confidence, c.reason]);

  document.getElementById('analysis').innerHTML =
    table(['五行', '分数', '档位'], elRows) +
    table(['要素', '成立', '依据'], facRows) +
    table(['格局候选', '十神', '透干', '置信度', '依据'], patRows) +
    `<p class="msg">旺衰倾向（参考）：${esc(s.tendency)}</p>`;
}

function renderDayun(chart) {
  const rows = chart.fortune.dayun.map(d => [
    d.index, d.ganZhi || '（出生前）',
    d.ganShiShen || '', d.changSheng || '', d.naYin || '',
    `${d.startYear}–${d.endYear}`, `${d.startAge}–${d.endAge}`,
  ]);
  document.getElementById('dayun').innerHTML =
    `<p class="msg">${esc(chart.fortune.direction)}（${esc(chart.fortune.directionReason)}）｜ 起运 ${esc(chart.fortune.startDate)}｜ ${esc(chart.fortune.method)}</p>` +
    table(['步', '干支', '十神', '长生', '纳音', '年份', '虚岁'], rows);
}

function renderLiunian(chart) {
  const rows = chart.fortune.liunian
    .filter(x => x.dayunIndex !== null)
    .map(x => [
      x.year, x.ganZhi, x.ganShiShen, x.changSheng,
      x.dayunGanZhi || '', x.age,
      x.benMingNian ? '本命年' : '', x.chongTaiSui ? '冲太岁' : '',
    ]);
  document.getElementById('liunian').innerHTML =
    table(['年份', '干支', '十神', '长生', '所属大运', '虚岁', '标记'], rows);
}

function renderChart(chart) {
  document.getElementById('chartSection').classList.remove('hidden');
  renderPillars(chart);
  renderDerived(chart);
  renderInteractions(chart);
  renderShensha(chart);
  renderAnalysis(chart);
  renderDayun(chart);
  renderLiunian(chart);
}

// ---- 会话 ----
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;          // 5 分钟（阶段二要调大模型出长文）
let currentSessionId = null;

// 会话 id 存 sessionStorage（不是 localStorage）—— 关掉标签页就该失效，
// 但页面后退/刷新时还能回到同一会话，不用再调一次大模型。
const SESSION_STORAGE_KEY = 'sessionId';

/**
 * 读上次留下的会话 id。
 * sessionStorage 在某些环境（例如 file:// 直接打开页面）访问会抛异常，
 * 读不到就当没有旧会话，不影响主流程。
 */
function readStoredSessionId() {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

/** 记住会话 id；存不进去（比如隐私模式）也不该影响主流程 */
function writeStoredSessionId(id) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch (e) {
    // 忽略：会话仍在本次页面生命周期内可用
  }
}

/** 会话已废（error / 404）时清掉，免得下次刷新还去查一个死会话 */
function clearStoredSessionId() {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    // 忽略
  }
}

/** 隐藏上一张命盘 —— 提交失败时不能让用户把旧命盘误认成本次结果 */
function hideChart() {
  const sec = document.getElementById('chartSection');
  if (sec) sec.classList.add('hidden');
}

async function submitSession() {
  setMsg('正在推事业结果，约需 30 秒…');
  document.getElementById('btnSubmit').disabled = true;
  document.getElementById('btnStartChat').disabled = true;
  // 请求发出前先把上一张命盘收起来：失败了页面上不会残留上一张命盘
  hideChart();

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collectForm()),
  });
  const json = await res.json();
  if (!res.ok) {
    setMsg((json.errors && json.errors[0]) || '提交失败，请检查出生信息', true);
    document.getElementById('btnSubmit').disabled = false;
    hideChart();
    return;
  }

  currentSessionId = json.sessionId;
  // 记住会话 id —— 后退/刷新回到输入页时还能找回这个会话
  writeStoredSessionId(currentSessionId);
  // 命盘此刻已经算好了，先显示出来
  renderChart(json.chart);
  document.getElementById('chartSection').classList.remove('hidden');

  await pollSession();
}

async function pollSession() {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`/api/session/${currentSessionId}/status`);
    const json = await res.json();
    if (!res.ok) {
      // /status 只在会话不存在（404）时失败 —— 会话没了，清掉记着的 id
      clearStoredSessionId();
      setMsg((json.errors && json.errors[0]) || '查询失败，请重试', true);
      document.getElementById('btnSubmit').disabled = false;
      return;
    }
    if (json.status === 'ready') {
      setMsg('事业结果已就绪，可以开始聊天了');
      document.getElementById('btnStartChat').disabled = false;
      return;
    }
    if (json.status === 'error') {
      // 会话已废：清掉记着的 id，重试要用新会话
      clearStoredSessionId();
      setMsg(json.error || '事业推理失败，请重试', true);
      document.getElementById('btnSubmit').disabled = false;
      return;
    }
  }
  setMsg('等待超时，请重试', true);
  document.getElementById('btnSubmit').disabled = false;
}

/**
 * 页面初始化时回填上次留下的会话。
 * 读到了 id 就问一次 /status，按返回的 status 决定【开始聊天】按钮：
 *   ready  → 解禁（可以直接回到同一个聊天页）
 *   pending→ 恢复轮询
 *   error  → 清掉 id（会话已废，重试要用新会话），按钮保持禁用
 *   404    → 同上
 * 不会因此自动重新提交。
 */
async function restoreSession() {
  const stored = readStoredSessionId();
  if (!stored) return;
  currentSessionId = stored;

  let res;
  let json;
  try {
    res = await fetch(`/api/session/${encodeURIComponent(stored)}/status`);
    json = await res.json();
  } catch (e) {
    // 网络异常：查不到就当没有旧会话
    clearStoredSessionId();
    currentSessionId = null;
    return;
  }

  if (!res.ok) {
    // 404：会话不存在或已过期 —— 清掉，按钮保持禁用
    clearStoredSessionId();
    currentSessionId = null;
    setMsg('上次的会话已失效，请重新提交', true);
    document.getElementById('btnSubmit').disabled = false;
    return;
  }
  if (json.status === 'ready') {
    setMsg('上次的会话已就绪，可以直接开始聊天');
    document.getElementById('btnStartChat').disabled = false;
    return;
  }
  if (json.status === 'error') {
    clearStoredSessionId();
    currentSessionId = null;
    setMsg(json.error || '上次的会话推理失败，请重新提交', true);
    document.getElementById('btnSubmit').disabled = false;
    return;
  }
  // pending：恢复轮询，等它跑完
  await pollSession();
}

function startChat() {
  if (!currentSessionId) return;
  window.location.href = `./chat.html?session=${encodeURIComponent(currentSessionId)}`;
}

/** HTML 转义 —— 渲染的字段可能来自外部输入，不能直接拼进 innerHTML */
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ---- 换日方式开关：副标题跟随开关状态 ----
// 开关打开 = 23:00 换日（子时归次日）；关闭（默认）= 00:00 换日（子时归当日）
function syncDayBoundaryHint() {
  const box = document.getElementById('dayBoundary');
  const hint = document.getElementById('dayBoundaryHint');
  if (!box || !hint) return;
  hint.textContent = box.checked ? '23:00 换日（子时归次日）' : '00:00 换日（子时归当日）';
}

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  // 输入页才有的元素：勘验页上没有，跳过绑定
  const province = document.getElementById('province');
  if (province) {
    loadCities();
    province.addEventListener('change', fillCities);
  }

  const dayBoundary = document.getElementById('dayBoundary');
  if (dayBoundary) {
    dayBoundary.addEventListener('change', syncDayBoundaryHint);
    syncDayBoundaryHint();
  }

  const btnSubmit = document.getElementById('btnSubmit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitSession);

  const btnStartChat = document.getElementById('btnStartChat');
  if (btnStartChat) {
    btnStartChat.addEventListener('click', startChat);
    // 输入页才有【开始聊天】按钮 —— 在这里回填上次留下的会话
    restoreSession();
  }
});
