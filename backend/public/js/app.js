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
    `<p class="msg">旺衰倾向（参考）：${esc(s.tendency)} ｜ 身强身弱定论与用神按方案留空，由解读层基于候选判断。</p>`;
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

// ---- 请求 ----
async function doChart() {
  setMsg('排盘中…');
  const res = await fetch('/api/paipan/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collectForm()),
  });
  const json = await res.json();
  if (!res.ok) {
    setMsg((json.errors || []).join('；') || '排盘失败', true);
    return null;
  }
  setMsg('排盘完成。');
  renderChart(json.data);
  return json.data;
}

// ---- 解读渲染 ----
const INTERPRET_SECTIONS = {
  basicInfo: '基础信息',
  personality: '性格心性',
  career: '事业财运',
  marriage: '婚姻家庭',
  health: '身体健康',
  dayunAnalysis: '大运解析',
  liunianAnalysis: '流年解析',
  family: '六亲',
  summary: '全局总结',
  patternReview: '格局复盘',
};

const INTERPRET_FIELDS = {
  gender: '性别', pillars: '四柱', dayMaster: '日主', coreKeywords: '核心关键词',
  strength: '旺衰心性', evidence: '判断依据', traits: '优点特质', shortcomings: '短板缺陷',
  wealthPattern: '财运格局', incomeMode: '求财模式', advice: '建议',
  spouseStar: '配偶星', spouseTraits: '配偶特质', timing: '情缘特点',
  weakElements: '薄弱环节', risks: '隐患',
  direction: '排运方向', startAge: '起运岁数',
  parents: '父母', siblings: '兄弟姐妹', children: '子女',
  coreJudgment: '整体判断', keyAdvice: '落地建议',
  finalPattern: '最终格局', reasoning: '定局推理', yongShen: '喜用忌避',
  yongShenLogic: '取用逻辑', avoid: '避坑要点',
};

/** HTML 转义 —— 解读内容来自大模型，不能直接拼进 innerHTML */
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把一个值压成一行可读文本（数组/对象都处理） */
function flatten(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return v.map(x => (x && typeof x === 'object'
      ? Object.values(x).filter(y => y !== null && y !== undefined).map(esc).join(' · ')
      : esc(x))).join('；');
  }
  if (typeof v === 'object') {
    return Object.values(v).filter(y => y !== null && y !== undefined).map(esc).join(' ');
  }
  return esc(v);
}

/** 四柱的键名 → 展示用标签（解读页的 basicInfo.pillars 专用） */
const PILLAR_LABELS = [
  ['year', '年柱'], ['month', '月柱'], ['day', '日柱'], ['hour', '时柱'],
];

/** 把 LLM 返回的解读 JSON 渲染成可读的分段（不是直接 dump 原始 JSON） */
function renderInterpret(data) {
  if (!data || typeof data !== 'object') return '<p class="msg">解读内容为空</p>';
  const out = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out.push(`<h3 class="font-title-md text-title-md text-primary mt-stack-gap-md">${esc(INTERPRET_SECTIONS[key] || key)}</h3>`);
    if (typeof value !== 'object' || Array.isArray(value)) {
      out.push(`<div class="kv"><span class="k"></span><span class="v">${flatten(value)}</span></div>`);
      continue;
    }
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      // 四柱单独渲染：flatten() 只取 Object.values，会把「年/月/日/时」四个键名丢掉。
      // 只针对 basicInfo 特殊处理，不改 flatten() 的通用行为。
      if (key === 'basicInfo' && k === 'pillars' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [pk, label] of PILLAR_LABELS) {
          if (v[pk] === null || v[pk] === undefined) continue;
          out.push(`<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(v[pk])}</span></div>`);
        }
        continue;
      }
      const label = esc(INTERPRET_FIELDS[k] || k);
      if (Array.isArray(v)) {
        out.push(`<div class="kv"><span class="k">${label}</span><span class="v"></span></div>`);
        out.push('<ul class="bullets">' +
          v.map(x => `<li>${flatten(x)}</li>`).join('') +
          '</ul>');
      } else {
        out.push(`<div class="kv"><span class="k">${label}</span><span class="v">${flatten(v)}</span></div>`);
      }
    }
  }
  return out.join('');
}

async function doInterpret() {
  setMsg('正在提交解读任务…');
  document.getElementById('interpretSection').classList.remove('hidden');
  const out = document.getElementById('interpretOut');
  out.textContent = '解读中…';

  // 直接 POST /api/interpret，不先单独排一次盘：
  // done 响应里已经带回离线命盘（服务端算好的命盘），省掉一次重复排盘。
  const res = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collectForm()),
  });
  const json = await res.json();
  if (!res.ok) {
    out.textContent = '';
    setMsg((json.errors || []).join('；') || '提交解读任务失败', true);
    return;
  }
  // 202 响应里已经带回离线命盘：立刻显示，不用干等大模型
  if (json.chart) renderChart(json.chart);

  // 轮询上限：最多 60 次 / 3 分钟，避免任务永远 pending 时无限轮询
  const MAX_POLLS = 60;
  const MAX_WAIT_MS = 3 * 60 * 1000;
  const startedAt = Date.now();
  let polls = 0;

  const poll = async () => {
    polls += 1;
    if (polls > MAX_POLLS || Date.now() - startedAt > MAX_WAIT_MS) {
      out.textContent = '';
      setMsg('解读等待超时，请稍后重试', true);
      return;
    }
    const r = await fetch('/api/interpret/' + json.jobId);
    const j = await r.json();
    if (j.status === 'pending') {
      out.textContent = `解读中…（已等待 ${j.elapsed} 秒）`;
      setTimeout(poll, 2000);
      return;
    }
    if (j.status === 'done') {
      // 服务端在 done 响应里带回命盘，直接渲染，不再另外排一次
      if (j.chart) renderChart(j.chart);
      out.innerHTML = renderInterpret(j.data);
      setMsg('解读完成。');
      return;
    }
    out.textContent = '';
    setMsg(j.error || '解读失败', true);
  };
  poll();
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
  loadCities();
  document.getElementById('province').addEventListener('change', fillCities);
  document.getElementById('btnChart').addEventListener('click', doChart);
  document.getElementById('btnInterpret').addEventListener('click', doInterpret);
  const dayBoundary = document.getElementById('dayBoundary');
  dayBoundary.addEventListener('change', syncDayBoundaryHint);
  syncDayBoundaryHint();
});
