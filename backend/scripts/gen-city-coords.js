'use strict';

/**
 * 离线生成城市经纬度表。
 *
 * 数据源（全部 MIT 许可的 npm 包）：
 *   1. echarts-china-cities-js        → 直辖市/地级市的区级与市级坐标
 *   2. chinese-global-compliant-geodata → 县级质心兜底 + 台湾省市级中心
 *   3. astrology-china-locations       → 少数冷门城市兜底
 *
 * 运行时（src/geo/index.js）只读落盘的 JSON，不联网。
 *
 * 用法：node scripts/gen-city-coords.js [cities.js 路径]
 */

const fs = require('fs');
const path = require('path');

const CITIES_JS = process.argv[2] ||
  path.join(__dirname, '..', '..', 'frontend', 'shared', 'cities.js');
const OUT = path.join(__dirname, '..', 'src', 'geo', 'city-coords.json');

// echarts-china-cities-js 不能 require（它的 dist/index.js 不存在），
// 只能定位到包目录后读它的原始 map 源文件。
const ECHARTS_PKG = path.join(
  path.dirname(require.resolve('echarts-china-cities-js/package.json')),
  'echarts-china-cities-js'
);

/** 从 v1 的 cities.js 里抽出 [[省, 市], ...] */
function parseCitiesJs(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /"([^"]+)"\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src))) {
    for (const c of m[2].matchAll(/"([^"]+)"/g)) out.push([m[1], c[1]]);
  }
  return out;
}

/** 去掉行政区划后缀，便于跨数据源匹配 */
function strip(name) {
  return name.replace(/(市辖区|市|区|县|盟|地区|自治州|自治县|林区|特别行政区|旗|县市)$/, '');
}

/**
 * 解析 echarts-china-cities-js 的原始 map 文件。
 * 这个包不能 require（dist/index.js 不存在），只能读它的 JS 源并正则抽取。
 * @returns {Object<string, {lng:number, lat:number, districts:Object}>}
 */
function parseEchartsCities() {
  const cities = {};
  const files = fs.readdirSync(ECHARTS_PKG).filter(f => f.endsWith('.js'));
  for (const fn of files) {
    const s = fs.readFileSync(path.join(ECHARTS_PKG, fn), 'utf8');
    const m = /registerMap\(\s*"([^"]+)"/.exec(s);
    if (!m) continue;
    const districts = {};
    const re = /properties:\{/g;
    let r;
    while ((r = re.exec(s))) {
      const seg = s.slice(r.index, r.index + 300);
      const cp = /cp:\s*\[([-\d.]+),\s*([-\d.]+)\]/.exec(seg);
      const nm = /name:\s*"([^"]+)"/.exec(seg);
      if (cp && nm && !districts[nm[1]]) {
        districts[nm[1]] = { lng: +cp[1], lat: +cp[2] };
      }
    }
    const names = Object.keys(districts);
    if (!names.length) continue;
    const first = districts[names[0]];
    cities[m[1]] = { lng: first.lng, lat: first.lat, districts };
  }
  return cities;
}

/** 取一组坐标的平均值（用于香港/澳门的区域合并） */
function mean(list) {
  const v = list.filter(Boolean);
  return {
    lng: v.reduce((s, x) => s + x.lng, 0) / v.length,
    lat: v.reduce((s, x) => s + x.lat, 0) / v.length,
  };
}

/** 县级 geojson：取所有顶点的质心 */
function buildLevel3Index() {
  const geodata = require('chinese-global-compliant-geodata');
  const raw = geodata.getCountyOrRegionGeoJSON('CHN', 3);
  const index = new Map();
  for (const f of raw.features) {
    let sx = 0, sy = 0, n = 0;
    const walk = (c) => {
      if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++; return; }
      for (const x of c) walk(x);
    };
    walk(f.geometry.coordinates);
    if (n) {
      index.set(f.properties.full_name, {
        lng: +(sx / n).toFixed(6), lat: +(sy / n).toFixed(6),
      });
    }
  }
  return index;
}

/** 台湾省市级中心点 */
function buildTaiwanIndex() {
  const geodata = require('chinese-global-compliant-geodata');
  const raw = geodata.getRegionGeoJSON('CHN', 'TW', 2);
  const index = new Map();
  for (const f of raw.features) {
    index.set(f.properties.full_name, {
      lng: f.properties.center[0], lat: f.properties.center[1],
    });
  }
  return index;
}

/** astrology-china-locations 的名称 → 坐标索引（含别名） */
function buildAstroIndex() {
  const astro = require('astrology-china-locations');
  const index = new Map();
  for (const e of astro.locations) {
    const coord = { lng: e.longitude, lat: e.latitude };
    if (!index.has(e.name)) index.set(e.name, coord);
    for (const a of e.aliases || []) {
      if (!index.has(a)) index.set(a, coord);
    }
  }
  return index;
}

function main() {
  const cities = parseCitiesJs(CITIES_JS);
  console.log(`省市条目：${cities.length}`);

  const raw = parseEchartsCities();
  const cityIndex = {};
  for (const k of Object.keys(raw)) {
    const key = strip(k);
    (cityIndex[key] = cityIndex[key] || []).push(k);
  }

  const level3 = buildLevel3Index();
  const taiwan = buildTaiwanIndex();
  const astro = buildAstroIndex();

  const MUNI = { 北京市: '北京', 天津市: '天津', 上海市: '上海', 重庆市: '重庆' };
  const HK = {
    香港岛: ['中西区', '湾仔区', '东区', '南区'],
    九龙: ['油尖旺区', '深水埗区', '九龙城区', '黄大仙区', '观塘区'],
    新界: ['荃湾区', '屯门区', '元朗区', '北区', '大埔区', '西贡区', '沙田区', '葵青区', '离岛区'],
  };
  const MO = {
    澳门半岛: ['花地玛堂区', '花王堂区', '望德堂区', '大堂区', '风顺堂区'],
    氹仔: ['嘉模堂区', '路凼填海区'],
    路环: ['圣方济各堂区'],
  };

  const out = {};
  const unresolved = [];

  for (const [province, city] of cities) {
    let hit = null;
    let how = '';

    if (MUNI[province]) {
      const d = raw[MUNI[province]].districts;
      const v = d[city] || d[strip(city)];
      if (v) { hit = { lng: v.lng, lat: v.lat }; how = 'echarts-district'; }
      else if (level3.has(city)) { hit = level3.get(city); how = 'geodata-l3'; }
    } else if (province === '香港特别行政区' && HK[city]) {
      hit = mean(HK[city].map(n => raw['香港'].districts[n]).filter(Boolean));
      how = 'echarts-hk';
    } else if (province === '澳门特别行政区' && MO[city]) {
      hit = mean(MO[city].map(n => raw['澳门'].districts[n]).filter(Boolean));
      how = 'echarts-mo';
    } else if (province === '台湾省' && taiwan.has(city)) {
      hit = taiwan.get(city);
      how = 'geodata-tw';
    } else {
      const cands = cityIndex[strip(city)];
      if (cands && cands.length) {
        hit = { lng: raw[cands[0]].lng, lat: raw[cands[0]].lat };
        how = 'echarts-city';
      } else if (astro.has(strip(city))) {
        hit = astro.get(strip(city));
        how = 'astro';
      } else if (level3.has(city)) {
        hit = level3.get(city);
        how = 'geodata-l3';
      }
    }

    if (hit) out[`${province}/${city}`] = { ...hit, how };
    else unresolved.push(`${province}/${city}`);
  }

  const byHow = {};
  for (const v of Object.values(out)) byHow[v.how] = (byHow[v.how] || 0) + 1;
  console.log('解析成功：', Object.keys(out).length, '/', cities.length);
  console.log('来源分布：', byHow);
  if (unresolved.length) console.log('未解析：\n' + unresolved.join('\n'));

  fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
  console.log('已写入：', OUT);
}

main();
