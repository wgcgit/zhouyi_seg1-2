'use strict';

const fs = require('fs');
const path = require('path');

const COORDS_PATH = path.join(__dirname, 'city-coords.json');
const RAW = JSON.parse(fs.readFileSync(COORDS_PATH, 'utf8'));

// RAW 的键是「省/市」，值 {lng, lat, how}
const INDEX = new Map();
for (const k of Object.keys(RAW)) {
  const [province, city] = k.split('/');
  INDEX.set(`${province}|${city}`, RAW[k]);
}

/** 全部可查城市数 */
const CITY_COUNT = INDEX.size;

/**
 * 按「省 + 市」查经纬度。
 * @param {string} province 省级名称，如 '北京市'
 * @param {string} city      城市名称，如 '东城区'
 * @returns {{lng:number, lat:number}|null}
 */
function lookupCoords(province, city) {
  return INDEX.get(`${province}|${city}`) || null;
}

/** 列出全部「省/市」键，供自检与前端下拉使用 */
function listAllKeys() {
  return Array.from(INDEX.keys());
}

module.exports = { lookupCoords, listAllKeys, CITY_COUNT, RAW };
