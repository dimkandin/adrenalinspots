// Passport and visa rules. Russian citizens get the hand-checked rules from the database (notes, sources, dates);
// any other passport uses the Passport Index table (web/visa/passports.json, see backend/visas_world.py), loaded once.
// Changing the passport reloads the page, like changing the language.
import { isRu, lang } from './i18n.js';

const KEY = 'passport';
let data = null;

function guess() {
  if (isRu) return 'RU';
  for (const l of navigator.languages || [navigator.language || '']) {
    const m = String(l).match(/^[a-z]{2,3}-([A-Z]{2})$/i);
    if (m) return m[1].toUpperCase();
  }
  return '';
}

export const passport = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved;   // '' = the visitor chose not to see visas
  } catch { /* storage unavailable */ }
  return guess();
})();
export const hasPassport = () => !!passport;
export const isRuPassport = () => passport === 'RU';

export function setPassport(cc) {
  if (cc === passport) return;
  try { localStorage.setItem(KEY, cc); } catch { /* ignore */ }
  location.reload();
}

/** Load the table for non-Russian passports; afterwards the list of passports and visaFor() work. */
export async function loadVisaTable() {
  if (data) return data;
  try {
    const r = await fetch('/visa/passports.json');
    data = r.ok ? await r.json() : null;
  } catch { data = null; }
  if (data && passport && passport !== 'RU' && !data.p[passport]) data.missing = true;
  return data;
}
export const visaTableDate = () => (data && data.updated) || null;

const regionNames = (l) => { try { return new Intl.DisplayNames([l], { type: 'region' }); } catch { return null; } };
const nameIn = (names, cc) => { try { return (names && names.of(cc)) || cc; } catch { return cc; } };
/** Lower case without accents (and ё → е), so «turkiye» finds «Türkiye» and «гренландия» any spelling. */
export const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// what people type instead of the official name
const ALIAS = { US: 'usa america америка сша', GB: 'uk britain england великобритания англия британия', AE: 'uae emirates эмираты оаэ',
  KR: 'south korea корея южная', KP: 'north korea корея северная кндр', NL: 'holland голландия', CZ: 'czech чехия', CI: 'ivory coast',
  CD: 'congo drc конго', CG: 'congo конго', MK: 'macedonia македония', SZ: 'swaziland свазиленд', MM: 'burma бирма', TR: 'turkey турция' };

/** All passports of the table (ISO codes), for the selector; Russia is always there.
 *  `find` holds the names to search by: the interface language, English and Russian, plus the ISO code. */
export function passportList() {
  const codes = new Set(data ? Object.keys(data.p) : []);
  codes.add('RU');
  if (passport) codes.add(passport);
  const names = regionNames(lang); const en = regionNames('en'); const ru = regionNames('ru');
  return [...codes].map((cc) => {
    const name = nameIn(names, cc);
    return { code: cc, name, find: fold([name, nameIn(en, cc), nameIn(ru, cc), cc, ALIAS[cc] || ''].join(' ')) };
  }).sort((a, b) => a.name.localeCompare(b.name, lang));
}
export const passportName = (cc) => nameIn(regionNames(lang), cc);

const STATUS = { h: 'home', f: 'no_visa', o: 'visa_on_arrival', e: 'evisa', t: 'eta', v: 'visa_required', x: 'no_entry' };

/** Visa for the chosen passport in a destination country: {status, stay_days, source: 'table'} or null. */
export function visaFor(cc) {
  if (!passport || passport === 'RU' || !data || !data.p[passport] || !cc) return null;
  const i = data.dest.indexOf(cc.toUpperCase());
  if (i < 0) return null;
  const tok = data.p[passport].split(',')[i] || '';
  if (!tok) return null;
  const status = STATUS[tok[0]];
  const days = Number(tok.slice(1)) || null;
  return status ? { status, stay_days: days, source: 'table' } : null;
}

/** Put the chosen passport's visa on a spot (list row or card): Russian keeps the database rules. */
export function applyPassport(s) {
  if (!s) return s;
  if (!passport) s.visa = null;
  else if (passport !== 'RU') s.visa = visaFor(s.cc);
  return s;
}
