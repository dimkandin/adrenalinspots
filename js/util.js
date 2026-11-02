// Shared constants, labels and small helpers. Every label comes from the interface dictionary (i18n.js).
import { num, t, tn } from './i18n.js';

export const MONTHS = t('months');
export const MONTHS_SHORT = t('months_short');
export const MONTHS_IN = t('months_in');

const COLORS = { peak: '#79c99a', shoulder: '#f3d36b', snow: '#ffffff', off: '#ee9a90' };
export const SEASON = Object.fromEntries(Object.entries(COLORS).map(([k, color]) => [k, {
  label: t(`season.${k}`), short: t(`season.${k}.short`), phrase: t(`season.${k}.phrase`), color,
}]));

const VISA_STYLE = {
  home: ['neutral', '⌂'], no_visa: ['good', '✓'], visa_on_arrival: ['easy', '✓'], evisa: ['easy', '@'],
  visa_easy: ['warn', '!'], visa_hard: ['bad', '✕'], banned: ['bad', '⛔'],
};
export const VISA = Object.fromEntries(Object.entries(VISA_STYLE).map(([k, [tone, icon]]) => [k, { label: t(`visa.${k}`), tone, icon }]));

const dictOf = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, t(`${prefix}.${k}`)]));
export const WATER = dictOf('water', ['flat', 'chop', 'waves', 'big_waves', 'snow', 'ice']);
export const LEVEL = dictOf('level', ['beginner', 'intermediate', 'advanced']);
export const SCHOOLS = dictOf('schools', ['none', 'few', 'several', 'many']);
export const WIND_TYPE = dictOf('wind_type', ['thermal', 'trade', 'monsoon', 'frontal', 'katabatic', 'mixed']);
export const SPOT_TYPE = dictOf('spot_type', ['lagoon', 'beach', 'bay', 'lake', 'reservoir', 'river', 'sandbank', 'snow_plateau', 'frozen_lake']);
export const vibeLabel = (score) => t(`vibe.${score}`);

// --- units -----------------------------------------------------------------
let unit = 'kn';
try { unit = localStorage.getItem('unit') || 'kn'; } catch { /* storage unavailable */ }
export const getUnit = () => unit;
export function setUnit(u) { unit = u; try { localStorage.setItem('unit', u); } catch { /* ignore */ } }
export const unitLabel = () => (unit === 'kn' ? t('unit.kn') : t('unit.ms'));
export function wind(kn, digits) {
  if (kn == null || Number.isNaN(kn)) return null;
  const v = unit === 'kn' ? kn : kn * 0.514444;
  const d = digits ?? (unit === 'kn' ? 0 : 1);
  return Number(v.toFixed(d));
}
export function windText(kn) {
  const v = wind(kn);
  return v == null ? '—' : `${num(v)} ${unitLabel()}`;
}
export function windRangeText(range) {
  if (!range) return null;
  if (unit === 'kn') return `${range} ${t('unit.kn')}`;
  const nums = String(range).match(/\d+(\.\d+)?/g);
  if (!nums) return range;
  return nums.map((n) => String(Math.round(Number(n) * 0.514444))).join('–') + ` ${t('unit.ms')}`;
}

// --- formatting ------------------------------------------------------------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - 65, A + cc.toUpperCase().charCodeAt(1) - 65);
}
export const spots = (n) => tn('n.spots', n);
export const rating = (r) => num(r, 1);
export const deg = (c) => (c == null ? '—' : `${Math.round(c)}°`);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
