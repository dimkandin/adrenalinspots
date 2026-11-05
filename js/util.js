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
  eta: ['easy', '@'], visa_required: ['warn', '!'], no_entry: ['bad', '⛔'],   // other passports (Passport Index table)
};
export const VISA = Object.fromEntries(Object.entries(VISA_STYLE).map(([k, [tone, icon]]) => [k, { label: t(`visa.${k}`), tone, icon }]));

const dictOf = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, t(`${prefix}.${k}`)]));
export const WATER = dictOf('water', ['flat', 'chop', 'waves', 'big_waves', 'snow', 'ice']);
export const LEVEL = dictOf('level', ['beginner', 'intermediate', 'advanced', 'expert', 'technical']);
export const DIVETYPE = dictOf('divetype', ['reef', 'wall', 'wreck', 'drift', 'cave', 'muck', 'pelagic', 'kelp']);
export const ACCESS = dictOf('access', ['shore', 'boat', 'liveaboard']);
// surf
export const BREAK = dictOf('break', ['beach', 'reef', 'point', 'rivermouth', 'mixed']);
export const BOTTOM = dictOf('bottom', ['sand', 'reef', 'rock', 'mixed']);
export const TIDE = dictOf('tide', ['low', 'low_mid', 'mid', 'mid_high', 'high', 'all']);
// mountains
export const PARK = dictOf('park', ['none', 'small', 'good', 'pro']);
export const SNOWMAKING = dictOf('snowmaking', ['none', 'some', 'most']);
// climbing
export const STYLE = dictOf('style', ['boulder', 'sport', 'multipitch', 'trad', 'dws']);
export const ROCK = dictOf('rock', ['limestone', 'granite', 'sandstone', 'gneiss', 'quartzite', 'conglomerate', 'basalt', 'gritstone', 'other']);
export const BOLTING = dictOf('bolting', ['good', 'mixed', 'sparse', 'trad']);
/** How a daytime high feels for climbing: friction for bouldering, comfort for rope climbing. */
export function climbFeel(tmax, boulder = false) {
  if (tmax == null) return null;
  if (tmax < (boulder ? 0 : 5)) return 'cold';
  if (tmax <= (boulder ? 16 : 22)) return boulder ? 'great_b' : 'great';
  if (tmax <= (boulder ? 22 : 28)) return 'warm';
  return 'hot';
}
// paragliding
export const FLYING = dictOf('flying', ['thermal', 'soaring', 'mixed']);
export const PG_LEVEL = dictOf('pglevel', ['tandem', 'student', 'pilot', 'xc']);
/** Compass points in the interface language: 'SW' -> 'ЮЗ' in Russian, 'SO' in Spanish… */
export const compassText = (d) => String(d).split('').map((ch) => t('compass_letters')['NESW'.indexOf(ch)] || ch).join('');
export const kmh = (kn) => (kn == null ? '—' : `${num(Math.round(kn * 1.852))} ${t('unit.kmh')}`);
// windsurf
export const WSTYLE = dictOf('wstyle', ['freeride', 'bump_jump', 'wave', 'freestyle', 'slalom', 'speed', 'foil']);
/** Usual sail for a ~75 kg rider at a given wind (m², rule of thumb 1.34 × weight / knots); null below planing wind. */
export function sailSize(kn) {
  if (kn == null || kn < 10) return null;
  return Math.max(3.3, Math.min(9.5, Math.round((1.34 * 75 / kn) * 10) / 10));
}
export const SCHOOLS = dictOf('schools', ['none', 'few', 'several', 'many']);
export const WIND_TYPE = dictOf('wind_type', ['thermal', 'trade', 'monsoon', 'frontal', 'katabatic', 'mixed']);
export const SPOT_TYPE = dictOf('spot_type', ['lagoon', 'beach', 'bay', 'lake', 'reservoir', 'river', 'sandbank', 'snow_plateau', 'frozen_lake']);
export const vibeLabel = (score) => t(`vibe.${score}`);

// phones and portrait tablets get the bottom-sheet layout (same query as the @media block in app.css)
export const PHONE_QUERY = '(max-width: 900px) and (orientation: portrait), (max-width: 560px)';

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
export const metres = (m, digits = 1) => (m == null ? '—' : `${num(m, digits)} ${t('unit.m')}`);
export const cm = (v) => (v == null ? '—' : `${num(Math.round(v))} ${t('unit.cm')}`);
/** Usual wetsuit for a water temperature (surf wetsuit charts). */
export function wetsuit(c) {
  if (c == null) return null;
  const k = c >= 25 ? 'none' : c >= 22 ? 'top' : c >= 19 ? 'shorty' : c >= 16 ? '32' : c >= 13 ? '43' : c >= 10 ? '54' : '65';
  return t(`wetsuit.${k}`);
}

/** Usual dive suit for a water temperature, for a 40–60-minute dive (dive centres' and shops' charts: Sinai Divers,
 *  ScubaDiving.com, Mike's Dive Store — the warmer end, since a diver keeps still and does 2–3 dives a day). */
export function diveSuit(c) {
  if (c == null) return null;
  const k = c >= 29 ? '3' : c >= 27 ? '35' : c >= 24 ? '5' : c >= 21 ? '7' : c >= 18 ? '7hood' : c >= 14 ? 'semidry' : 'dry';
  return t(`divesuit.${k}`);
}

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
