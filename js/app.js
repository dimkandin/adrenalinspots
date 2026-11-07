// Kite Atlas — app entry: state, data loading, sidebar list, month strip.
import { aboutTeaser, openAbout } from './about.js';
import { initAnalytics, track, trackView } from './analytics.js';
import { BASEMAPS } from './basemaps.js';
import { injectFlagCSS } from './flags.js';
import { applyFilter, clearHover, getBasemap, initMap, onMapNotice, setBasemap, setData, setSelected, updatePadding } from './map.js';
import { closePanel, currentSpot, renderPanel, showPanelError } from './panel.js';
import { LANGS, PREFIX, applyStatic, isRu, lang, loadSpotTexts, localizeSpot, logicalPath, num, setLang, t, tn } from './i18n.js';
import { applyPassport, fold, hasPassport, loadVisaTable, passport, passportList, setPassport } from './visa.js';
import {
  MONTHS, MONTHS_IN, MONTHS_SHORT, PHONE_QUERY, SEASON, VISA, cm, deg, esc, flagEmoji, getUnit, h, metres, rating, setUnit, spots as spotsText, windText,
} from './util.js';

// What each section (activity) shows: quick filters, dropdowns, season kinds, and the number in the list
const ACT = {
  kite: { qf: ['novisa', 'ru', 'flat', 'wave'], dd: ['minRating', 'pop', 'minAir', 'vibe', 'minWater'], seasons: ['peak', 'shoulder', 'snow', 'off'], unit: true,
    value: (s, m) => (s.wind && s.wind[m - 1] != null ? windText(s.wind[m - 1]) : '') },
  surf: { qf: ['novisa', 'ru', 'beginner'], dd: ['minRating', 'pop', 'brk', 'dir', 'minAir', 'vibe', 'minWater'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s, m) => (s.swell && s.swell[m - 1] != null ? metres(s.swell[m - 1]) : '') },
  snowboard: { qf: ['novisa', 'ru', 'beginner', 'park', 'freeride', 'glacier'], dd: ['minRating', 'pop', 'maxPass', 'minVert', 'minKm', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s, m) => (s.snow && s.snow[m - 1] != null ? cm(s.snow[m - 1]) : '') },
  climbing: { qf: ['novisa', 'ru', 'beginner', 'hard', 'rain', 'shade'], dd: ['minRating', 'pop', 'style', 'rock', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s, m) => (s.air && s.air[m - 1] != null ? deg(s.air[m - 1]) : '') },
  windsurf: { qf: ['novisa', 'ru', 'beginner', 'flat', 'wave', 'rental'], dd: ['minRating', 'pop', 'wstyle', 'minAir', 'vibe', 'minWater'], seasons: ['peak', 'shoulder', 'off'], unit: true,
    value: (s, m) => (s.wind && s.wind[m - 1] != null ? windText(s.wind[m - 1]) : '') },
  diving: { qf: ['novisa', 'ru', 'beginner', 'shore', 'snorkel'], dd: ['minRating', 'pop', 'divetype', 'minWater', 'maxDive', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s, m) => (s.sea && s.sea[m - 1] != null ? deg(s.sea[m - 1]) : ''), valueTitle: () => t('row.water_title') },
  sailing: { qf: ['novisa', 'ru', 'beginner', 'bareboat', 'flotilla', 'catamaran'], dd: ['minRating', 'pop', 'sdiff', 'maxCharter', 'minWater', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: true,
    value: (s, m) => (s.wind && s.wind[m - 1] != null ? windText(s.wind[m - 1]) : '') },
  bungee: { qf: ['novisa', 'ru', 'high', 'dip', 'swing'], dd: ['minRating', 'pop', 'platform', 'minHeight', 'maxJump', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s) => (s.height_m ? `${num(s.height_m)} ${t('unit.m')}` : ''), valueTitle: () => t('row.height_title') },
  viaferrata: { qf: ['novisa', 'ru', 'beginner', 'kids', 'vfbridge', 'kitrent'], dd: ['minRating', 'pop', 'vfdiff', 'maxGuide', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s) => (s.difficulty ? VF_GRADE[s.difficulty - 1] : ''), valueTitle: () => t('row.vf_title') },
  paragliding: { qf: ['novisa', 'ru', 'tandem', 'courses', 'beginner', 'xc'], dd: ['minRating', 'pop', 'flytype', 'maxTandem', 'vibe'], seasons: ['peak', 'shoulder', 'off'], unit: false,
    value: (s, m) => (s.fly && s.fly[m - 1] != null ? `${s.fly[m - 1]}%` : ''), valueTitle: () => t('row.fly_title') },
};
const DEFAULT_FILTERS = {
  novisa: false, ru: false, flat: false, wave: false, beginner: false, brk: null, dir: null, park: false, freeride: false, glacier: false,
  minRating: null, minAir: null, minWater: null, vibe: null, pop: null, maxPass: null, minVert: null, minKm: null,
  hard: false, rain: false, shade: false, style: null, rock: null,
  tandem: false, courses: false, xc: false, flytype: null, maxTandem: null,
  rental: false, wstyle: null,
  shore: false, snorkel: false, divetype: null, maxDive: null,
  bareboat: false, flotilla: false, catamaran: false, sdiff: null, maxCharter: null,
  high: false, dip: false, swing: false, platform: null, minHeight: null, maxJump: null,
  kids: false, vfbridge: false, kitrent: false, vfdiff: null, maxGuide: null,
};
const MAIN_PLATFORMS = ['bridge', 'dam', 'tower', 'cable_car'];
const VF_GRADE = ['A', 'B', 'C', 'D', 'E'];   // the 1–5 via ferrata scale read as the Hüsler letters most topos use
const MAIN_ROCKS = ['limestone', 'granite', 'sandstone'];
const savedActivity = (() => { try { return localStorage.getItem('activity'); } catch { return null; } })();

const state = {
  month: new Date().getMonth() + 1,
  activity: ACT[savedActivity] ? savedActivity : 'kite',
  activities: [{ id: 'kite', enabled: true }],
  seasons: { peak: true, shoulder: true, snow: true, off: false },
  filters: { ...DEFAULT_FILTERS },
  sideAuto: false,
  query: '',
  selected: null,
  spots: [],
  seasonsOn() { return Object.keys(this.seasons).filter((k) => this.seasons[k]); },
};

// ---------- data -----------------------------------------------------------------
// The Python server (localhost / home network) answers /api; the public site is static files only.
const HAS_API = /^(localhost|127\.|192\.168\.|10\.|\[::1\]|[^.]+$)/.test(location.hostname);
async function getJSON(apiUrl, staticUrl) {
  let r = null;
  if (HAS_API) {
    try {
      r = await fetch(apiUrl);
    } catch (e) {
      r = null;  // no server -> try the exported JSON below
    }
  }
  if (r && r.ok) return r.json();
  if (r && r.status !== 404) {
    let msg = t('err.server', { status: r.status });
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  if (r && r.status === 404) {
    // our API answers an unknown spot with JSON {error}; a static host answers with its own 404 page
    let apiError = null;
    try { const j = await r.json(); apiError = j && j.error; } catch { /* not our API */ }
    if (apiError) throw new Error(apiUrl.includes('/api/spots/') ? t('err.not_found') : apiError);
  }
  const r2 = await fetch(staticUrl);
  if (!r2.ok) throw new Error(r2.status === 404 ? t('err.not_found') : t('err.no_data', { status: r2.status }));
  return r2.json();
}
const loadMeta = () => getJSON('/api/meta', '/data/meta.json');
const loadSpots = () => getJSON(`/api/spots?activity=${state.activity}`, `/data/spots-${state.activity}.json`);
const loadSpot = async (id) => {
  const spot = await getJSON(`/api/spots/${encodeURIComponent(id)}?activity=${state.activity}`, `/data/spot/${encodeURIComponent(id)}.json`);
  // a spot can belong to several sections: show the seasons of the one being browsed
  if (spot.seasons_by && spot.seasons_by[state.activity]) { spot.seasons = spot.seasons_by[state.activity]; spot.activity = state.activity; }
  await visaReady;
  return applyPassport(localizeSpot(spot));
};
const visaReady = loadVisaTable();   // rules for non-Russian passports and the list of passports

// ---------- filtering -----------------------------------------------------------
function passesFilters(s, m = state.month) {
  const f = state.filters;
  if (f.novisa && state.spots.some((x) => x.visa) && !(s.visa && ['home', 'no_visa', 'visa_on_arrival', 'evisa', 'eta'].includes(s.visa.status))) return false;
  if (f.ru && s.ru_schools !== 'yes') return false;
  if (f.flat && !(s.water || []).includes('flat')) return false;
  if (f.wave && !((s.wave_riding || 0) >= 2)) return false;
  if (f.beginner && !(['snowboard', 'climbing', 'paragliding'].includes(state.activity) ? (s.beginner || 0) >= 4 : (s.level || []).includes('beginner'))) return false;
  if (f.hard && !((s.hard || 0) >= 4)) return false;
  if (f.rain && !((s.rain_ok || 0) >= 2)) return false;
  if (f.shade && !((s.shade || 0) >= 4)) return false;
  if (f.style && !(s.styles || []).includes(f.style)) return false;
  if (f.wstyle && !(s.styles || []).includes(f.wstyle)) return false;
  if (f.rental && !s.rental) return false;
  if (f.shore && !(s.access || []).includes('shore')) return false;
  if (f.snorkel && !s.snorkeling) return false;
  if (f.divetype && !(s.dive_types || []).includes(f.divetype)) return false;
  if (f.maxDive != null && !(s.dive_price_eur != null && s.dive_price_eur <= f.maxDive)) return false;
  if (f.bareboat && !(s.charter || []).includes('bareboat')) return false;
  if (f.flotilla && !(s.charter || []).includes('flotilla')) return false;
  if (f.catamaran && !(s.boats || []).includes('catamaran')) return false;
  if (f.sdiff && !(s.difficulty != null && (f.sdiff === 'easy' ? s.difficulty <= 2 : f.sdiff === 'medium' ? s.difficulty === 3 : s.difficulty >= 4))) return false;
  if (f.maxCharter != null && !(s.charter_price_eur != null && s.charter_price_eur <= f.maxCharter)) return false;
  if (f.kids && !s.kids) return false;
  if (f.vfbridge && !(s.features || []).some((x) => x === 'bridge' || x === 'tibetan')) return false;
  if (f.kitrent && !s.kit_rental) return false;
  if (f.vfdiff && !(s.difficulty != null && (f.vfdiff === 'easy' ? s.difficulty <= 2 : f.vfdiff === 'medium' ? s.difficulty === 3 : s.difficulty >= 4))) return false;
  if (f.maxGuide != null && !(s.guide_price_eur != null && s.guide_price_eur <= f.maxGuide)) return false;
  if (f.high && !((s.height_m || 0) >= 100)) return false;
  if (f.dip && !s.water_touch) return false;
  if (f.swing && !(s.extras || []).includes('swing')) return false;
  if (f.platform && !(f.platform === 'other' ? s.platform && !MAIN_PLATFORMS.includes(s.platform) : s.platform === f.platform)) return false;
  if (f.minHeight != null && !((s.height_m || 0) >= f.minHeight)) return false;
  if (f.maxJump != null && !(s.price_eur != null && s.price_eur <= f.maxJump)) return false;
  if (f.tandem && !s.tandem) return false;
  if (f.courses && !s.courses) return false;
  if (f.xc && !((s.xc || 0) >= 4)) return false;
  if (f.flytype && !(s.flying_type === f.flytype || s.flying_type === 'mixed')) return false;
  if (f.maxTandem != null && !(s.tandem_price_eur != null && s.tandem_price_eur <= f.maxTandem)) return false;
  if (f.rock && !(f.rock === 'other' ? s.rock && !MAIN_ROCKS.includes(s.rock) : s.rock === f.rock)) return false;
  if (f.park && !['good', 'pro'].includes(s.snowpark)) return false;
  if (f.freeride && !((s.freeride || 0) >= 4)) return false;
  if (f.glacier && !s.glacier) return false;
  if (f.maxPass != null && !(s.lift_pass_eur != null && s.lift_pass_eur <= f.maxPass)) return false;
  if (f.minVert != null && !((s.vertical_m || 0) >= f.minVert)) return false;
  if (f.minKm != null && !((s.pistes_km || 0) >= f.minKm)) return false;
  if (f.brk && s.break_type !== f.brk && s.break_type !== 'mixed') return false;
  if (f.dir && !(s.wave_direction || []).includes(f.dir)) return false;
  if (f.minRating != null && !((s.rating || 0) >= f.minRating)) return false;
  if (f.minAir != null && !(s.air && s.air[m - 1] != null && s.air[m - 1] >= f.minAir)) return false;
  if (f.minWater != null && !(s.sea && s.sea[m - 1] != null && s.sea[m - 1] >= f.minWater)) return false;
  if (f.pop) {
    const p = s.popularity;
    if (p == null) return false;
    if (f.pop === 'hidden' && p > 2) return false;
    if (f.pop === 'mid' && p < 3) return false;
    if (f.pop === 'top' && p < 4) return false;
  }
  if (f.vibe) {
    const v = s.vibe ? s.vibe.score : null;
    if (v == null) return false;
    if (f.vibe === 'quiet' && v > 2) return false;
    if (f.vibe === 'life' && v < 3) return false;
    if (f.vibe === 'party' && v < 4) return false;
  }
  if (state.query) {
    const hay = normText(`${s.name} ${s.name_ru} ${s.country || ''} ${s.country_en || ''} ${s.region || ''} ${s.alt_names || ''}`);
    if (!hay.includes(normText(state.query))) return false;
  }
  return true;
}
// search ignores case, accents, ё/е, hyphens, dashes and spaces
const normText = (x) => String(x).toLowerCase().replace(/ё/g, 'е').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-–—'’.,()]+/g, '');
const seasonOf = (s, m = state.month) => s.seasons[m - 1] || 'off';
const inSeason = (s, m = state.month) => seasonOf(s, m) !== 'off';
const seasonsChanged = () => ACT[state.activity].seasons.some((k) => state.seasons[k] !== (k !== 'off'));
const filtersOn = () => Object.keys(DEFAULT_FILTERS).filter((k) => state.filters[k] !== DEFAULT_FILTERS[k]);
const anyFilter = () => seasonsChanged() || filtersOn().length > 0 || !!state.query;

function features() {
  return state.spots.filter((s) => passesFilters(s) || s.id === state.selected).map((s) => ({
    type: 'Feature',
    id: s.id,
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: {
      id: s.id, name_ru: s.name_ru, cc: s.cc, country: s.country, rating: s.rating,
      season: seasonOf(s), wind: s.wind ? s.wind[state.month - 1] : null,
      swell: s.swell ? s.swell[state.month - 1] : null, period: s.period ? s.period[state.month - 1] : null,
      snow: s.snow ? s.snow[state.month - 1] : null, dry: s.dry ? s.dry[state.month - 1] : null, fly: s.fly ? s.fly[state.month - 1] : null,
      air: s.air ? s.air[state.month - 1] : null, sea: s.sea ? s.sea[state.month - 1] : null,
      visa_status: s.visa ? s.visa.status : null,
      vibe: s.vibe ? s.vibe.score : null,
    },
  }));
}

// ---------- rendering ---------------------------------------------------------------
let shortSummary = null;   // «93 spots in season» for the phone bar
function renderMonthHeading() {
  document.querySelector('.month-title').textContent = MONTHS[state.month - 1];
  const sub = document.querySelector('.month-sub');
  if (state.loadError) { sub.textContent = t('heading.error'); return; }
  if (!state.spots.length) { sub.textContent = t('heading.loading'); return; }
  const visible = state.spots.filter((s) => inSeason(s) && passesFilters(s) && (state.seasons[seasonOf(s)] || state.query));
  shortSummary = visible.length ? t('heading.in_season', { spots: spotsText(visible.length) }) : null;
  const peak = visible.filter((s) => seasonOf(s) === 'peak').length;
  const offShown = (state.seasons.off || state.query) ? state.spots.filter((s) => !inSeason(s) && passesFilters(s)).length : 0;
  if (visible.length) {
    sub.textContent = `${t('heading.in_season', { spots: spotsText(visible.length) })}${peak ? `, ${tn('n.peak', peak)}` : ''}`;
  } else if (offShown) {
    sub.textContent = t('heading.off_only', { n: offShown });
  } else {
    sub.textContent = t('heading.none');
  }
}

// phones and small tablets: bottom-sheet layout (see the matching @media block in app.css)
const PHONE = window.matchMedia(PHONE_QUERY);
const isPhone = () => PHONE.matches;

function centreCurrentMonth() {
  const strip = document.querySelector('.months');
  const cur = strip && strip.querySelector('.is-current');
  if (!cur || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollLeft = cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2;
}

function activeFilterCount() {
  return (seasonsChanged() ? 1 : 0) + filtersOn().length;
}

function renderStrip() {
  const strip = document.querySelector('.months');
  strip.innerHTML = '';
  const counts = MONTHS.map((_, i) => {
    const c = { peak: 0, shoulder: 0, snow: 0 };
    state.spots.forEach((s) => { const k = seasonOf(s, i + 1); if (k !== 'off' && state.seasons[k] && passesFilters(s, i + 1)) c[k] += 1; });
    return c;
  });
  const max = Math.max(1, ...counts.map((c) => c.peak + c.shoulder + c.snow));
  counts.forEach((c, i) => {
    const total = c.peak + c.shoulder + c.snow;
    const btn = h('button', {
      class: `m ${i + 1 === state.month ? 'is-current' : ''}`, role: 'radio', type: 'button',
      'aria-checked': i + 1 === state.month ? 'true' : 'false',
      'aria-label': t('strip.aria', { month: MONTHS[i], spots: spotsText(total), peak: c.peak }),
      title: t(ACT[state.activity].seasons.includes('snow') ? 'strip.title' : 'strip.title_nosnow', { month: MONTHS[i], peak: c.peak, shoulder: c.shoulder, snow: c.snow }),
      tabindex: i + 1 === state.month ? '0' : '-1', 'data-fk': `m-${i + 1}`,
      onclick: () => setMonth(i + 1),
    },
    h('span', { class: 'm-bars', 'aria-hidden': 'true' },
      h('i', { class: 'b-snow', style: `height:${(c.snow / max) * 100}%` }),
      h('i', { class: 'b-shoulder', style: `height:${(c.shoulder / max) * 100}%` }),
      h('i', { class: 'b-peak', style: `height:${(c.peak / max) * 100}%` })),
    h('span', { class: 'm-name' }, MONTHS_SHORT[i]));
    strip.append(btn);
  });
}

const SEASON_SHORT = { peak: t('sc.peak'), shoulder: t('sc.shoulder'), snow: t('sc.snow'), off: t('sc.off') };
function renderSeasons() {
  const counts = { peak: 0, shoulder: 0, snow: 0, off: 0 };
  state.spots.forEach((s) => { if (passesFilters(s)) counts[seasonOf(s)] += 1; });
  const host = document.querySelector('.seasons');
  host.innerHTML = '';
  for (const k of ACT[state.activity].seasons) {
    host.append(h('button', {
      type: 'button', class: `sc sc-${k} ${state.seasons[k] ? 'is-on' : ''}`, 'aria-pressed': state.seasons[k] ? 'true' : 'false', 'data-fk': `sc-${k}`,
      title: t(state.seasons[k] ? 'sc.hide' : 'sc.show', { label: SEASON[k].label }),
      onclick: () => { state.seasons[k] = !state.seasons[k]; refresh(); },
    }, h('span', { class: `flag-ico flag-${k}`, 'aria-hidden': 'true' }), h('span', { class: 'sc-label' }, SEASON_SHORT[k]), h('span', { class: 'sc-count' }, String(counts[k]))));
  }
}

function listRow(s) {
  const k = seasonOf(s);
  const visa = s.visa ? VISA[s.visa.status] : null;
  const value = ACT[state.activity].value(s, state.month);
  return h('li', {}, h('button', {
    type: 'button', class: `row row-${k} ${state.selected === s.id ? 'is-selected' : ''}`, 'data-fk': `row-${s.id}`,
    'aria-current': state.selected === s.id ? 'true' : null, onclick: (e) => select(s.id, { focusCard: true, from: e.currentTarget.dataset.fk }),
    onmouseenter: () => document.dispatchEvent(new CustomEvent('hover-spot', { detail: s.id })),
    onmouseleave: () => document.dispatchEvent(new CustomEvent('hover-spot', { detail: null })),
  },
  h('span', { class: `flag-ico flag-${k}`, 'aria-hidden': 'true' }),
  h('span', { class: 'row-main', title: `${s.name_ru}, ${s.country || ''}` }, h('span', { class: 'row-name' }, s.name_ru), h('span', { class: 'row-place' }, `${flagEmoji(s.cc)} ${s.country || ''}`)),
  h('span', { class: 'row-side' },
    h('span', { class: 'row-rating' }, `★ ${rating(s.rating)}`),
    h('span', { class: 'row-wind', title: ACT[state.activity].valueTitle ? ACT[state.activity].valueTitle() : null }, value),
    visa ? h('span', { class: `row-visa tone-${visa.tone}`, title: visa.label }, h('span', { 'aria-hidden': 'true' }, visa.icon), h('span', { class: 'visually-hidden' }, `, ${visa.label}`)) : null)));
}

function renderList() {
  const list = document.querySelector('.spot-list');
  clearHover();  // rows are rebuilt, so their mouseleave would never fire
  const order = { peak: 0, shoulder: 1, snow: 1 };
  const rows = state.spots.filter((s) => inSeason(s) && passesFilters(s) && (state.seasons[seasonOf(s)] || state.query))
    .sort((a, b) => order[seasonOf(a)] - order[seasonOf(b)] || (b.rating || 0) - (a.rating || 0));
  // off-season spots are listed when «Не сезон» is on — and always while searching by name
  const off = (state.seasons.off || state.query) ? state.spots.filter((s) => !inSeason(s) && passesFilters(s)).sort((a, b) => (b.rating || 0) - (a.rating || 0)) : [];
  document.querySelector('.list-head').textContent = rows.length ? t('list.head', { in_month: MONTHS_IN[state.month - 1] }) : '';
  list.innerHTML = '';
  if (!rows.length && !off.length) {
    list.append(h('li', { class: 'empty' }, state.loadError ? t('list.load_error') : state.spots.length
      ? (state.query ? t('list.not_found') : t('list.empty'))
      : t('heading.loading')));
    return;
  }
  rows.forEach((s) => list.append(listRow(s)));
  if (off.length) {
    list.append(h('li', { class: 'list-sub' }, t('list.off', { in_month: MONTHS_IN[state.month - 1] })));
    off.forEach((s) => list.append(listRow(s)));
  }
  list.append(aboutTeaser());
}

let opener = null;          // data-fk of the control that opened the card (focus returns there)
let lastAnnounced = null;
function refresh({ fit = false } = {}) {
  const active = document.activeElement;
  const fk = active && active.dataset ? active.dataset.fk : null;
  const f = features();
  setData(f);
  applyFilter();
  renderMonthHeading();
  renderStrip();
  renderSeasons();
  renderDropdownLabels();
  renderList();
  document.querySelector('.reset').hidden = !anyFilter();
  // phone: summary on the bar that opens the sheet, filter count on the «Filters» button
  document.querySelector('.so-sum').textContent = shortSummary || document.querySelector('.month-sub').textContent;
  const n = activeFilterCount();
  document.querySelector('.filters-toggle').textContent = n ? `${t('filters.toggle')} · ${n}` : t('filters.toggle');
  centreCurrentMonth();   // only when the strip scrolls (phones, or a narrow strip between the list and the card)
  const vibeBtn = document.querySelector('.dd[data-key="vibe"] .dd-btn');
  if (vibeBtn) {
    const hasVibe = state.spots.some((s) => s.vibe);
    vibeBtn.disabled = state.spots.length > 0 && !hasVibe;
    vibeBtn.title = vibeBtn.disabled ? t('dd.vibe.disabled') : t('dd.vibe.title');
    if (vibeBtn.disabled && state.filters.vibe) state.filters.vibe = null;
  }
  // The visa filter only makes sense once visa rules are in the database.
  const visaBtn = document.querySelector('.qf[data-filter="novisa"]');
  if (visaBtn) {
    const hasVisa = state.spots.some((s) => s.visa);
    visaBtn.disabled = state.spots.length > 0 && !hasVisa;
    visaBtn.title = visaBtn.disabled ? t('qf.novisa_disabled') : t('qf.novisa_title');
  }
  writeHash();
  if (fk) {
    const again = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (again && again !== document.activeElement) again.focus({ preventScroll: true });
  }
  if (lastAnnounced !== state.month) {
    lastAnnounced = state.month;
    document.querySelector('#status').textContent = `${MONTHS[state.month - 1]}: ${document.querySelector('.month-sub').textContent}`;
  }
  if (fit) { /* reserved for future region presets */ }
}

// ---------- actions ---------------------------------------------------------------
let frame = null;
function setMonth(m, { focusStrip = false } = {}) {
  state.month = ((m - 1 + 12) % 12) + 1;
  if (frame) cancelAnimationFrame(frame);
  // a burst of key presses renders once per frame
  frame = requestAnimationFrame(() => {
    frame = null;
    const inCard = document.activeElement && document.activeElement.closest('.panel');
    refresh();
    const cur = currentSpot();
    if (cur) renderPanel(cur, panelCtx());
    if (focusStrip) document.querySelector(`[data-fk="m-${state.month}"]`)?.focus();
    else if (inCard && cur) document.querySelector('#panel-title')?.focus({ preventScroll: true });
  });
}
const panelCtx = () => ({ month: state.month, setMonth, activity: state.activity, spots: state.spots, open: (id) => select(id, { focusCard: true }) });

async function select(id, { focusCard = false, from = null } = {}) {
  if (!id) {
    const wasOpen = !!state.selected;
    state.selected = null; closePanel(); setSelected(null); renderList(); writeHash();
    updatePadding(true);
    if (state.sideAuto) { setSide(true); state.sideAuto = false; }
    markCramped();
    if (wasOpen) {
      const back = opener && document.querySelector(`[data-fk="${CSS.escape(opener)}"]`);
      if (back && back.offsetParent) back.focus({ preventScroll: true }); else focusSearch();
    }
    return;
  }
  if (!state.selected && isSideOpen() && window.innerWidth < 1700) { setSide(false); state.sideAuto = true; }
  opener = from;
  state.selected = id;
  renderList();
  writeHash();
  const panel = document.querySelector('.panel');
  panel.classList.add('is-open', 'is-loading');
  // the timeline, the buttons and the map make room at once (they used to wait for the spot to load, under the card)
  document.querySelector('.app').classList.add('has-panel');
  markCramped();
  try {
    const spot = await loadSpot(id);
    if (state.selected !== id) return;
    renderPanel(spot, panelCtx());
    setSelected(id, true);
    updateTitle(spot);
    trackView(`${spot.name} — ${state.activity}`);
    track('open_spot', { spot: id, activity: state.activity });
    if (focusCard) document.querySelector('#panel-title')?.focus({ preventScroll: true });
  } catch (e) {
    if (state.selected === id) { setSelected(null); showPanelError(t('err.spot', { msg: e.message })); }
  } finally {
    panel.classList.remove('is-loading');
  }
}

// ---------- URL state ------------------------------------------------------------
// The address is a real page, with the language prefix (/en/…): /surf/november (a section with a month chosen —
// the address to share and the one search engines and AI assistants link for «where to go surfing in November»),
// /surf (the section; the app moves on to /surf/<current month>), /spot/<id>#m=7&a=surf (a spot; month and section
// in the hash). Each exists as a static file (backend/seo.py) with its own title, link preview and text for robots.
const MONTH_SLUGS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pageActivity = document.querySelector('meta[name="as:activity"]')?.content || null;
function writeHash() {
  const p = new URLSearchParams();
  let path = `/${state.activity}/${MONTH_SLUGS[state.month - 1]}`;
  if (state.selected) {
    path = `/spot/${encodeURIComponent(state.selected)}`;
    p.set('m', String(state.month));
    if (state.activity !== 'kite') p.set('a', state.activity);
  }
  const search = new URLSearchParams(location.search);
  search.delete('lang');                       // the language is in the path now
  const q = search.toString();
  const hash = p.toString();
  const next = `${PREFIX}${path}${q ? `?${q}` : ''}${hash ? `#${hash}` : ''}`;
  if (`${location.pathname}${location.search}${location.hash}` !== next) history.replaceState(null, '', next);
  updateTitle();
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const m = Number(p.get('m'));
  if (Number.isInteger(m) && m >= 1 && m <= 12) state.month = m;
  const path = logicalPath();
  const spotPath = path.match(/^\/spot\/([^/]+)$/);
  const monthPath = path.match(/^\/([a-z]+)\/([a-z]+)$/);
  if (monthPath && ACT[monthPath[1]] && MONTH_SLUGS.includes(monthPath[2])) state.month = MONTH_SLUGS.indexOf(monthPath[2]) + 1;
  const sectionPath = path.match(/^\/([a-z]+)$/) || (monthPath && ACT[monthPath[1]] ? monthPath : null);
  const a = p.get('a') || (sectionPath && ACT[sectionPath[1]] ? sectionPath[1] : null) || pageActivity;
  if (a && ACT[a]) { state.activity = a; state.activityFromUrl = true; }
  else if (p.has('m') && !spotPath) { state.activity = 'kite'; state.activityFromUrl = true; }   // an old shared link without a= is a kite link
  return spotPath ? decodeURIComponent(spotPath[1]) : p.get('spot');   // #spot= in links shared before November 2026
}
const sportName = (a = state.activity) => t(`sport.${a}`);
function updateTitle(spot = currentSpot()) {
  if (spot && state.selected === spot.id) {
    const key = `meta.spot_title.${state.activity}`, vars = { name: spot.name_ru, sport: sportName() };
    const title = t(key, vars);   // a search-friendly title per sport; the plain one if a language lacks it
    document.title = title === key ? t('meta.spot_title', vars) : title;
  } else document.title = t('meta.month_title', { sport: sportName(), in_month: MONTHS_IN[state.month - 1] });
}

// ---------- sidebar --------------------------------------------------------------
const isSideOpen = () => !document.querySelector('.app').classList.contains('side-collapsed');
// Laptops with the list and the card both open leave a narrow strip of map: the big month heading would run into the
// basemap button and the card, so it steps aside (the month strip still shows the month).
function markCramped() {
  const app = document.querySelector('.app');
  if (isPhone()) { app.classList.remove('cramped'); return; }
  const side = isSideOpen() ? document.querySelector('.side').offsetWidth + 16 : 0;
  const card = app.classList.contains('has-panel') ? document.querySelector('.panel').offsetWidth + 16 : 0;
  app.classList.toggle('cramped', window.innerWidth - side - card < 400);
  centreCurrentMonth();   // a narrow strip scrolls: keep the chosen month in view
}
window.addEventListener('resize', () => markCramped());
requestAnimationFrame(() => markCramped());   // the list is open by default, without a setSide() call

function setSide(open, { moveFocus = false, persist = false } = {}) {
  document.querySelector('.app').classList.toggle('side-collapsed', !open);
  markCramped();
  document.querySelector('.side').inert = !open;
  if (moveFocus) (open ? document.querySelector('.side-toggle') : document.querySelector('.side-open')).focus();
  if (persist) { try { localStorage.setItem('side', open ? 'open' : 'closed'); } catch { /* ignore */ } }
  setTimeout(() => updatePadding(true), 30);
}

// ---------- dropdown filters (rating, temperatures, activity) -------------------------
const DROPDOWNS = [
  {
    key: 'activity', label: () => t(`sport.${state.activity}`), title: t('dd.activity.title'),
    options: ['kite', 'surf', 'windsurf', 'snowboard', 'climbing', 'paragliding', 'diving', 'sailing', 'bungee', 'viaferrata'].map((v) => ({ value: v, text: t(`dd.activity.${v}`) })),
    get: () => state.activity, set: (v) => switchActivity(v), active: () => false,
  },
  {
    key: 'brk', title: t('dd.break.title'),
    label: (v) => (v ? t(`break.${v}`) : t('dd.break.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...['beach', 'reef', 'point', 'rivermouth'].map((v) => ({ value: v, text: t(`break.${v}`) }))],
  },
  {
    key: 'dir', title: t('dd.dir.title'),
    label: (v) => (v ? t(`dd.dir.${v}`) : t('dd.dir.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...['left', 'right'].map((v) => ({ value: v, text: t(`dd.dir.${v}`) }))],
  },
  {
    key: 'style', title: t('dd.style.title'),
    label: (v) => (v ? t(`style.${v}`) : t('dd.style.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...['boulder', 'sport', 'multipitch', 'trad', 'dws'].map((v) => ({ value: v, text: t(`style.${v}`) }))],
  },
  {
    key: 'wstyle', title: t('dd.wstyle.title'),
    label: (v) => (v ? t(`wstyle.${v}`) : t('dd.wstyle.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...['freeride', 'bump_jump', 'wave', 'freestyle', 'slalom', 'speed', 'foil'].map((v) => ({ value: v, text: t(`wstyle.${v}`) }))],
  },
  {
    key: 'rock', title: t('dd.rock.title'),
    label: (v) => (v ? t(`rock.${v}`) : t('dd.rock.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...[...MAIN_ROCKS, 'other'].map((v) => ({ value: v, text: t(v === 'other' ? 'dd.rock.other' : `rock.${v}`) }))],
  },
  {
    key: 'flytype', title: t('dd.flytype.title'),
    label: (v) => (v ? t(`flying.${v}`) : t('dd.flytype.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...['thermal', 'soaring'].map((v) => ({ value: v, text: t(`flying.${v}`) }))],
  },
  {
    key: 'divetype', title: t('dd.divetype.title'),
    label: (v) => (v ? t(`divetype.${v}`) : t('dd.divetype.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...['reef', 'wall', 'wreck', 'drift', 'cave', 'muck', 'pelagic', 'kelp'].map((v) => ({ value: v, text: t(`divetype.${v}`) }))],
  },
  {
    key: 'sdiff', title: t('dd.sdiff.title'),
    label: (v) => (v ? t(`sdiff.${v}`) : t('dd.sdiff.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...['easy', 'medium', 'hard'].map((v) => ({ value: v, text: t(`sdiff.${v}`) }))],
  },
  {
    key: 'maxCharter', title: t('dd.charter.title'),
    label: (v) => (v == null ? t('dd.charter.label') : t('dd.charter.label_v', { v: num(v) })),
    options: [{ value: null, text: t('dd.any_f') }, ...[2000, 3000, 4500].map((v) => ({ value: v, text: t('dd.charter.opt', { v: num(v) }) }))],
  },
  {
    key: 'vfdiff', title: t('dd.vfdiff.title'),
    label: (v) => (v ? t(`vfdiff.${v}`) : t('dd.vfdiff.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...['easy', 'medium', 'hard'].map((v) => ({ value: v, text: t(`vfdiff.${v}`) }))],
  },
  {
    key: 'maxGuide', title: t('dd.guide.title'),
    label: (v) => (v == null ? t('dd.guide.label') : t('dd.guide.label_v', { v })),
    options: [{ value: null, text: t('dd.any_m') }, ...[80, 120, 180].map((v) => ({ value: v, text: t('dd.guide.opt', { v }) }))],
  },
  {
    key: 'platform', title: t('dd.platform.title'),
    label: (v) => (v ? t(`platform.${v}`) : t('dd.platform.label')),
    options: [{ value: null, text: t('dd.any_m') }, ...[...MAIN_PLATFORMS, 'other'].map((v) => ({ value: v, text: t(v === 'other' ? 'dd.platform.other' : `platform.${v}`) }))],
  },
  {
    key: 'minHeight', title: t('dd.height.title'),
    label: (v) => (v == null ? t('dd.height.label') : t('dd.height.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[50, 100, 150, 200].map((v) => ({ value: v, text: t('dd.height.opt', { v }) }))],
  },
  {
    key: 'maxJump', title: t('dd.jump.title'),
    label: (v) => (v == null ? t('dd.jump.label') : t('dd.jump.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[80, 120, 180].map((v) => ({ value: v, text: t('dd.jump.opt', { v }) }))],
  },
  {
    key: 'maxDive', title: t('dd.dive.title'),
    label: (v) => (v == null ? t('dd.dive.label') : t('dd.dive.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[30, 50, 80].map((v) => ({ value: v, text: t('dd.dive.opt', { v }) }))],
  },
  {
    key: 'maxTandem', title: t('dd.tandem.title'),
    label: (v) => (v == null ? t('dd.tandem.label') : t('dd.tandem.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[80, 120, 160].map((v) => ({ value: v, text: t('dd.tandem.opt', { v }) }))],
  },
  {
    key: 'minRating', title: t('dd.rating.title'),
    label: (v) => (v == null ? t('dd.rating.label') : t('dd.rating.label_v', { v: num(v) })),
    options: [{ value: null, text: t('dd.rating.any') }, ...[3.5, 4, 4.3, 4.5].map((v) => ({ value: v, text: t('dd.rating.opt', { v: num(v, 1) }) }))],
  },
  {
    key: 'pop', title: t('dd.pop.title'),
    label: (v) => (v ? t(`dd.pop.label_${v}`) : t('dd.pop.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...['hidden', 'mid', 'top'].map((v) => ({ value: v, text: t(`dd.pop.${v}`) }))],
  },
  {
    key: 'minAir', title: t('dd.air.title'),
    label: (v) => (v == null ? t('dd.air.label') : t('dd.air.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[15, 20, 25, 30].map((v) => ({ value: v, text: t('dd.temp.opt', { v }) }))],
  },
  {
    key: 'vibe', title: t('dd.vibe.title'),
    label: (v) => (v ? t(`dd.vibe.label_${v}`) : t('dd.vibe.label')),
    options: [{ value: null, text: t('dd.any_f') }, ...['quiet', 'life', 'party'].map((v) => ({ value: v, text: t(`dd.vibe.${v}`) }))],
  },
  {
    key: 'maxPass', title: t('dd.pass.title'),
    label: (v) => (v == null ? t('dd.pass.label') : t('dd.pass.label_v', { v })),
    options: [{ value: null, text: t('dd.any_m') }, ...[40, 60, 80].map((v) => ({ value: v, text: t('dd.pass.opt', { v }) }))],
  },
  {
    key: 'minVert', title: t('dd.vert.title'),
    label: (v) => (v == null ? t('dd.vert.label') : t('dd.vert.label_v', { v: num(v) })),
    options: [{ value: null, text: t('dd.any_m') }, ...[500, 1000, 1500].map((v) => ({ value: v, text: t('dd.vert.opt', { v: num(v) }) }))],
  },
  {
    key: 'minKm', title: t('dd.km.title'),
    label: (v) => (v == null ? t('dd.km.label') : t('dd.km.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[50, 100, 200].map((v) => ({ value: v, text: t('dd.km.opt', { v }) }))],
  },
  {
    key: 'minWater', title: t('dd.water.title'),
    label: (v) => (v == null ? t('dd.water.label') : t('dd.water.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[16, 20, 24, 27].map((v) => ({ value: v, text: t(`dd.water.${v}`) }))],
  },
];

// show only the filters of the current section; sections without data are greyed out in the menu
function applyActivityUI() {
  const cfg = ACT[state.activity];
  document.querySelectorAll('.qf').forEach((b) => {
    b.hidden = !cfg.qf.includes(b.dataset.filter);
    const ownLabel = `qf.${b.dataset.filter}_${state.activity}`;   // e.g. «Russian school» reads «in Russian» for bungee operators
    if (b.dataset.i18n) b.textContent = t(ownLabel) !== ownLabel ? t(ownLabel) : t(b.dataset.i18n);
    const own = `qf.${b.dataset.filter}_title_${state.activity}`;   // e.g. «beginner» means different things in surf and skiing
    if (t(own) !== own) b.title = t(own);
    else if (b.dataset.i18nTitle) b.title = t(b.dataset.i18nTitle);
    else b.removeAttribute('title');
  });
  document.querySelectorAll('.dd[data-key]').forEach((d) => { if (d.dataset.key !== 'activity') d.hidden = !cfg.dd.includes(d.dataset.key); });
  document.querySelectorAll('.dd[data-key="minWater"] .dd-opt').forEach((o) => {   // divers read the scale in wetsuit mm
    if (o.dataset.v === 'null') return;
    const own = `dd.water.${o.dataset.v}_${state.activity}`;
    o.textContent = t(own) !== own ? t(own) : t(`dd.water.${o.dataset.v}`);
  });
  const enabled = new Set(state.activities.filter((a) => a.enabled && ACT[a.id]).map((a) => a.id));
  document.querySelectorAll('.dd[data-key="activity"] .dd-opt').forEach((o) => {
    const on = enabled.has(o.dataset.v);
    o.disabled = !on;
    o.title = on ? '' : t('dd.activity.soon');
  });
  document.querySelector('.unit')?.closest('.side-foot')?.classList.toggle('no-unit', !cfg.unit);
  document.querySelector('.app').dataset.activity = state.activity;
  const icon = `<svg viewBox="0 0 32 32">${PICK_ICONS[state.activity] || PICK_ICONS.kite}</svg>`;
  document.querySelectorAll('.sport-ico').forEach((el) => { el.innerHTML = icon; });
  const pill = document.querySelector('.sport-pill');
  if (pill) {
    pill.querySelector('.sport-pill-name').textContent = t(`dd.activity.${state.activity}_short`);
    pill.title = t('pick.change_title');
    pill.setAttribute('aria-label', `${t('dd.activity.title')}: ${sportName()}`);
  }
}

async function switchActivity(a) {
  if (!ACT[a] || a === state.activity) return;
  state.activity = a;
  try { localStorage.setItem('activity', a); } catch { /* ignore */ }
  track('switch_activity', { activity: a });
  Object.assign(state.filters, DEFAULT_FILTERS);
  Object.assign(state.seasons, { peak: true, shoulder: true, snow: true, off: false });
  document.querySelectorAll('.qf').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  if (state.selected) select(null);
  state.spots = []; state.loadError = false;
  applyActivityUI();
  writeHash();
  refresh();
  await loadActivitySpots();
}

async function loadActivitySpots() {
  const want = state.activity;
  try {
    const [data] = await Promise.all([loadSpots(), visaReady]);
    if (want !== state.activity) return;
    state.spots = data.spots.map(localizeSpot).map(applyPassport);
    state.loadError = false;
    lastAnnounced = null;   // announce the real counts once the data is in
    refresh();
  } catch (e) {
    if (want !== state.activity) return;
    state.loadError = true;
    refresh();
    document.querySelector('.spot-list').innerHTML = `<li class="empty error">${esc(t('list.spots_error', { msg: e.message }))}</li>`;
    throw e;
  }
}

function renderDropdownLabels() {
  for (const d of DROPDOWNS) {
    const btn = document.querySelector(`.dd[data-key="${d.key}"] .dd-btn`);
    if (!btn) continue;
    const v = d.get ? d.get() : state.filters[d.key];
    const active = d.active ? d.active() : v != null;
    btn.querySelector('.dd-label').textContent = d.label(v);
    btn.classList.toggle('is-active', active);
    btn.closest('.dd').querySelectorAll('.dd-opt').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.v === String(v))));
  }
}

function closeMenus({ focusButton = false } = {}) {
  let closed = false;
  document.querySelectorAll('.dd-menu:not([hidden]), .bm-menu:not([hidden])').forEach((m) => {
    m.hidden = true; closed = true;
    fitMenu(m);
    const btn = m.previousElementSibling;
    btn.setAttribute('aria-expanded', 'false');
    if (focusButton) btn.focus();
  });
  return closed;
}

function menuKeys(menu, selector) {
  menu.addEventListener('keydown', (e) => {
    const opts = [...menu.querySelectorAll(selector)];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { opts[(i + 1) % opts.length].focus(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { opts[(i - 1 + opts.length) % opts.length].focus(); e.preventDefault(); }
    else if (e.key === 'Home') { opts[0].focus(); e.preventDefault(); }
    else if (e.key === 'End') { opts[opts.length - 1].focus(); e.preventDefault(); }
  });
  // A press inside the menu must not move focus: in WebKit (Safari, every iPhone browser incl. Arc) a tapped button
  // doesn't take focus, so the focused option would blur to <body> and the menu would close before the click lands.
  menu.addEventListener('mousedown', (e) => e.preventDefault());
}
/** Close a menu when keyboard focus leaves it, but not in the middle of a tap or click inside it. */
function closeOnFocusLeave(wrap, menu, btn) {
  let pressing = 0;
  wrap.addEventListener('pointerdown', () => { pressing = Date.now(); });
  wrap.addEventListener('focusout', (e) => {
    if (wrap.contains(e.relatedTarget) || menu.hidden || Date.now() - pressing < 800) return;
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
  });
}

// A menu that doesn't fit below its button (a low window, a phone on its side) scrolls inside, or opens upwards when
// there is more room above; the passport list opens upwards by design and gets the same treatment at the top.
// Phones show menus as bottom sheets (CSS) and are left alone.
function fitMenu(menu) {
  menu.classList.remove('dd-up');
  for (const k of ['maxHeight', 'position', 'left', 'right', 'top', 'bottom']) menu.style[k] = '';
  if (isPhone() || menu.hidden) return;
  const btn = menu.previousElementSibling;
  if (!btn) return;
  const b = btn.getBoundingClientRect();
  const below = window.innerHeight - b.bottom - 14; const above = b.top - 14;
  const upward = menu.classList.contains('pp-menu');     // the passport list opens upwards by design
  // a phone on its side: the side panel scrolls and would cut the menu at its right edge — lift the menu out of it
  const side = menu.closest('.side');
  if (side && getComputedStyle(side).overflowY !== 'visible') {
    menu.style.position = 'fixed';
    menu.style.right = 'auto';
    menu.style.left = `${Math.round(Math.max(8, Math.min(b.left, window.innerWidth - menu.offsetWidth - 8)))}px`;
    const up = upward ? above > 160 || above >= below : below < 220 && above > below;
    if (up) { menu.style.top = 'auto'; menu.style.bottom = `${Math.round(window.innerHeight - b.top + 6)}px`; menu.style.maxHeight = `${Math.round(above)}px`; }
    else { menu.style.top = `${Math.round(b.bottom + 6)}px`; menu.style.bottom = 'auto'; menu.style.maxHeight = `${Math.round(below)}px`; }
    return;
  }
  const r = menu.getBoundingClientRect();
  if (r.top >= b.top) {                                   // opens downwards
    if (r.bottom <= window.innerHeight - 8) return;
    if (below < 220 && above > below) { menu.classList.add('dd-up'); menu.style.maxHeight = `${Math.round(above)}px`; }
    else menu.style.maxHeight = `${Math.round(Math.max(120, below))}px`;
  } else if (r.top < 8) {                                 // opens upwards and runs off the top
    menu.style.maxHeight = `${Math.round(Math.max(160, above))}px`;
  }
}

// Touch screens: never focus the search field on our own — the on-screen keyboard would cover half the screen
const COARSE = window.matchMedia('(pointer: coarse)');
function focusSearch() { if (!COARSE.matches) document.querySelector('#search')?.focus({ preventScroll: true }); }

// Focus an option and scroll only the menu to it (plain focus() could also scroll the page's own boxes and shift the layout)
function focusIn(menu, opt) {
  if (!opt) return;
  opt.focus({ preventScroll: true });
  if (menu.scrollHeight > menu.clientHeight) menu.scrollTop = opt.offsetTop - (menu.clientHeight - opt.offsetHeight) / 2;
}

function initDropdowns() {
  document.querySelector('.side')?.addEventListener('scroll', () => {
    if (document.querySelector('.dd-menu:not([hidden])[style*="fixed"]')) closeMenus();
  }, { passive: true });
  const host = document.querySelector('.dropdowns');
  for (const d of DROPDOWNS) {
    const id = `dd-${d.key}`;
    const btn = h('button', { type: 'button', class: `dd-btn ${d.key === 'activity' ? 'dd-activity' : ''}`, title: d.title, 'aria-expanded': 'false', 'aria-controls': id },
      d.key === 'activity' ? h('span', { class: 'sport-ico', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'dd-label' }), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
    const menu = h('div', { class: 'dd-menu', id, role: 'group', 'aria-label': d.title, hidden: true }, h('p', { class: 'dd-title', 'aria-hidden': 'true' }, d.title));
    for (const o of d.options) {
      menu.append(h('button', {
        type: 'button', class: 'dd-opt', 'data-v': String(o.value), 'aria-pressed': 'false', disabled: o.disabled || false,
        onclick: () => {
          if (d.set) d.set(o.value); else state.filters[d.key] = o.value;
          closeMenus({ focusButton: true }); refresh();
        },
      }, o.text));
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      fitMenu(menu);
      if (open) focusIn(menu, menu.querySelector('.dd-opt[aria-pressed="true"]') || menu.querySelector('.dd-opt:not(:disabled)'));
    });
    const wrap = h('div', { class: 'dd', 'data-key': d.key }, btn, menu);
    closeOnFocusLeave(wrap, menu, btn);
    menuKeys(menu, '.dd-opt:not(:disabled)');
    (d.key === 'activity' ? document.querySelector('.dd-host[data-slot="activity"]') : host).append(wrap);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.dd, .basemaps')) closeMenus(); });
  // iPhone browsers often send no click for a tap on the map or empty space: close on the press itself
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dd, .basemaps, .dd-menu, .bm-menu')) closeMenus(); }, true);
}

// ---------- phones: swipe the list sheet down to close it ------------------------------------
// The drag starts anywhere in the sheet's head (title, season chips, filters, search) or in the list when it is
// scrolled to the top; the sheet follows the finger and closes past ~90 px or on a quick flick.
function initSheetSwipe() {
  const side = document.querySelector('.side');
  const list = side.querySelector('.spot-list');
  let armed = false; let drag = false; let inList = false; let x0 = 0; let y0 = 0; let t0 = 0; let dy = 0;
  side.addEventListener('touchstart', (e) => {
    armed = isPhone() && isSideOpen() && e.touches.length === 1 && !e.target.closest('input, select, textarea, .dd-menu');
    if (!armed) return;
    inList = !!e.target.closest('.spot-list');
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; drag = false;
  }, { passive: true });
  side.addEventListener('touchmove', (e) => {
    if (!armed) return;
    const tt = e.touches[0];
    const ddy = tt.clientY - y0; const ddx = tt.clientX - x0;
    if (!drag) {
      if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
      // a sheet scrolled down scrolls back up first (on phones the whole sheet is the scroller)
      if (ddy <= 0 || Math.abs(ddx) > Math.abs(ddy) || side.scrollTop > 0 || (inList && list.scrollTop > 0)) { armed = false; return; }
      drag = true;
      side.style.transition = 'none';
      closeMenus();
    }
    dy = Math.max(0, ddy);
    side.style.transform = `translateY(${dy}px)`;
    e.preventDefault();   // the sheet moves, the page and the list don't scroll
  }, { passive: false });
  const end = () => {
    if (!armed) return;
    armed = false;
    if (!drag) return;
    drag = false;
    const flick = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.5;
    side.style.transition = '';
    side.style.transform = '';
    if (dy > 90 || flick) { state.sideAuto = false; setSide(false, { persist: false }); }
  };
  side.addEventListener('touchend', end);
  side.addEventListener('touchcancel', end);
}

// ---------- phones: swipe the spot card down to close it --------------------------------------
// Anywhere on the card (photos, title, facts…) when it is scrolled to the top: the card follows the finger and closes
// past ~90 px or on a quick flick, like the × button. Sideways swipes stay with the photo strip; a card scrolled down
// scrolls back up first.
function initPanelSwipe() {
  const panel = document.querySelector('.panel');
  const body = panel.querySelector('.panel-body');
  let armed = false; let drag = false; let x0 = 0; let y0 = 0; let dy = 0; let trail = [];
  panel.addEventListener('touchstart', (e) => {
    armed = isPhone() && panel.classList.contains('is-open') && e.touches.length === 1
      && body.scrollTop <= 0 && !e.target.closest('input, select, textarea, .lightbox');
    if (!armed) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dy = 0; drag = false; trail = [];
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!armed) return;
    const tt = e.touches[0];
    const ddy = tt.clientY - y0; const ddx = tt.clientX - x0;
    if (!drag) {
      if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
      if (ddy <= 0 || Math.abs(ddx) > Math.abs(ddy) || body.scrollTop > 0) { armed = false; return; }
      drag = true;
      panel.style.transition = 'none';
    }
    dy = Math.max(0, ddy);
    panel.style.transform = `translateY(${dy}px)`;
    const now = Date.now();
    trail.push([now, dy]);
    while (trail.length > 2 && now - trail[0][0] > 100) trail.shift();   // the finger's speed over the last ~0.1 s
    if (e.cancelable) e.preventDefault();   // the card moves, its content doesn't scroll
  }, { passive: false });
  const end = () => {
    if (!armed) return;
    armed = false;
    if (!drag) return;
    drag = false;
    // a flick: released while still moving down fast (a slow pull that ends in a quick throw counts too)
    const [first, last] = [trail[0], trail[trail.length - 1]];
    const speed = first && last !== first && Date.now() - last[0] < 100 ? (last[1] - first[1]) / Math.max(1, last[0] - first[0]) : 0;
    const flick = dy > 30 && speed > 0.4;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90 || flick) select(null);
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
}

// ---------- controls ---------------------------------------------------------------
function initControls() {
  document.querySelector('.prev').addEventListener('click', () => setMonth(state.month - 1));
  document.querySelector('.next').addEventListener('click', () => setMonth(state.month + 1));
  document.querySelector('.panel-close').addEventListener('click', () => select(null));
  // focus follows only a keyboard press (click.detail is 0 for Enter/Space): after a tap, Safari would draw a
  // focus ring around the arrow of the opened sheet
  document.querySelector('.side-toggle').addEventListener('click', (e) => { state.sideAuto = false; setSide(false, { moveFocus: e.detail === 0, persist: true }); });
  document.querySelector('.side-open').addEventListener('click', (e) => { state.sideAuto = false; setSide(true, { moveFocus: e.detail === 0, persist: true }); });
  if (isPhone()) setSide(false);   // phones start with the map; the bar at the bottom opens the list
  else { try { if (localStorage.getItem('side') === 'closed') setSide(false); } catch { /* ignore */ } }
  initSheetSwipe();
  initPanelSwipe();
  const ft = document.querySelector('.filters-toggle');
  ft.addEventListener('click', () => {
    const open = document.querySelector('.side').classList.toggle('filters-open');
    ft.setAttribute('aria-expanded', String(open));
  });
  for (const a of document.querySelectorAll('.skip')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.getAttribute('href') === '#months') document.querySelector(`[data-fk="m-${state.month}"]`)?.focus();
      else { if (!isSideOpen()) setSide(true); document.querySelector('#search').focus(); }
    });
  }
  initDropdowns();
  document.querySelector('.sport-pill')?.addEventListener('click', () => showSportPicker({ change: true }));
  document.querySelector('.reset').addEventListener('click', () => {
    Object.assign(state.filters, DEFAULT_FILTERS);
    Object.assign(state.seasons, { peak: true, shoulder: true, snow: true, off: false });
    state.query = ''; document.querySelector('#search').value = '';
    document.querySelectorAll('.qf').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    refresh();
    document.querySelector('#search').focus();
  });
  const search = document.querySelector('#search');
  search.addEventListener('focus', () => {
    if (!isPhone()) return;
    const side = document.querySelector('.side');
    side.classList.add('searching');
    const row = search.closest('.search-row') || search;
    side.scrollTop = row.offsetTop - (side.querySelector('.brand')?.offsetHeight || 0) - 4;
  });
  search.addEventListener('blur', () => document.querySelector('.side').classList.remove('searching'));
  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = search.value.trim(); refresh(); }, 150);
  });

  for (const btn of document.querySelectorAll('.qf')) {
    btn.addEventListener('click', () => {
      const k = btn.dataset.filter;
      state.filters[k] = !state.filters[k];
      btn.setAttribute('aria-pressed', state.filters[k] ? 'true' : 'false');
      refresh();
    });
  }
  for (const btn of document.querySelectorAll('.unit button')) {
    btn.setAttribute('aria-pressed', btn.dataset.unit === getUnit() ? 'true' : 'false');
    btn.addEventListener('click', () => {
      setUnit(btn.dataset.unit);
      document.querySelectorAll('.unit button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.unit === getUnit() ? 'true' : 'false'));
      refresh();
      const cur = currentSpot();
      if (cur) renderPanel(cur, panelCtx());
    });
  }
  const bm = document.querySelector('.basemaps');
  const current = () => BASEMAPS.find((b) => b.id === getBasemap()) || BASEMAPS[0];
  const toggle = h('button', { type: 'button', class: 'bm-toggle', 'aria-expanded': 'false', 'aria-controls': 'bm-menu' });
  const menu = h('div', { class: 'bm-menu', id: 'bm-menu', role: 'group', 'aria-label': t('bm.aria'), hidden: true });
  const paintToggle = () => {
    const c = current();
    toggle.innerHTML = '';
    toggle.append(h('span', { class: `bm-swatch bm-${c.id}`, 'aria-hidden': 'true' }), t('bm.toggle', { name: c.name }), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  };
  for (const b of BASEMAPS) {
    menu.append(h('button', { type: 'button', 'data-id': b.id, 'aria-pressed': b.id === getBasemap() ? 'true' : 'false',
      onclick: () => {
        setBasemap(b.id); paintToggle(); closeMenus({ focusButton: true });
        menu.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === b.id ? 'true' : 'false'));
      } },
    h('span', { class: `bm-swatch bm-${b.id}`, 'aria-hidden': 'true' }),
    h('span', { class: 'bm-text' }, h('b', {}, b.name), h('small', {}, b.hint))));
  }
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    fitMenu(menu);
    if (open) focusIn(menu, menu.querySelector('[aria-pressed="true"]'));
  });
  closeOnFocusLeave(bm, menu, toggle);
  menuKeys(menu, 'button');
  paintToggle();
  bm.append(toggle, menu);
  document.addEventListener('basemap-changed', () => {
    paintToggle();
    menu.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === getBasemap() ? 'true' : 'false'));
  });

  // month strip as a proper radio group: arrows / Home / End move the selection and the focus
  // a narrow strip scrolls sideways: the mouse wheel scrolls it too (there is no scrollbar)
  document.querySelector('.months').addEventListener('wheel', (e) => {
    const m = e.currentTarget;
    if (m.scrollWidth <= m.clientWidth + 1 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    m.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  document.querySelector('.months').addEventListener('keydown', (e) => {
    const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in map) { setMonth(state.month + map[e.key], { focusStrip: true }); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Home') { setMonth(1, { focusStrip: true }); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'End') { setMonth(12, { focusStrip: true }); e.preventDefault(); e.stopPropagation(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.lightbox')) return;           // the lightbox handles its own Esc
      if (e.target.id === 'search' && e.target.value) {          // 1) a typed search is cleared before the card closes
        e.target.value = ''; state.query = ''; refresh(); e.preventDefault(); return;
      }
      if (closeMenus({ focusButton: true })) { e.preventDefault(); return; }  // 1) an open menu
      if (state.selected) { select(null); e.preventDefault(); }  // 2) the card
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.target.closest('input, textarea, select, .maplibregl-canvas, .gallery, .dd, .basemaps, .months, .lightbox')) return;
    setMonth(state.month + (e.key === 'ArrowRight' ? 1 : -1));
    e.preventDefault();
  });
  window.addEventListener('hashchange', () => {
    const before = state.month;
    const beforeAct = state.activity;
    const id = readHash();
    if (state.activity !== beforeAct) {
      const a = state.activity; state.activity = beforeAct;
      switchActivity(a).then(() => { if (id) select(id); });
      return;
    }
    if (state.month !== before) { const m = state.month; state.month = before; setMonth(m); } else refresh();
    if (!id && state.selected) select(null);
    else if (id && id !== state.selected) select(id);
  });
}

// ---------- boot -----------------------------------------------------------------------
function toast(text) {
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}

function initLanguage() {
  applyStatic();
  document.querySelectorAll('.about-open, .about-foot').forEach((b) => b.addEventListener('click',
    (e) => openAbout(e.currentTarget, e.currentTarget.classList.contains('about-foot') ? 'heart' : 'info')));
  // Russian-speaking schools only matter in the Russian interface; the visa filter needs a passport
  if (!isRu) document.querySelectorAll('.qf[data-filter="ru"]').forEach((b) => b.remove());
  if (!hasPassport()) document.querySelectorAll('.qf[data-filter="novisa"]').forEach((b) => b.remove());
  const select = document.querySelector('#lang');
  for (const l of LANGS) select.append(h('option', { value: l.code, selected: l.code === lang }, l.name));
  select.addEventListener('change', () => setLang(select.value));
  select.addEventListener('input', () => setLang(select.value));
  initPassportPicker();
}

// ---------- passport: a button with a searchable list (≈200 countries are too many to scroll) ----------
const PASSPORT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.6"/><circle cx="8" cy="7" r="2.4"/><path d="M5.5 11.5h5"/></svg>';
function initPassportPicker() {
  const host = document.querySelector('.passport');
  if (!host) return;
  const btn = h('button', { type: 'button', class: 'pp-btn', title: t('passport.title'), 'aria-expanded': 'false', 'aria-controls': 'pp-menu' },
    h('span', { class: 'pp-ico', html: PASSPORT_ICON }), h('span', { class: 'pp-label' }), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  const input = h('input', { type: 'search', class: 'pp-search', placeholder: t('passport.search'), autocomplete: 'off', spellcheck: 'false', 'aria-label': t('passport.search') });
  const list = h('div', { class: 'pp-list', role: 'group', 'aria-label': t('passport.label') });
  const menu = h('div', { class: 'dd-menu pp-menu', id: 'pp-menu', role: 'dialog', 'aria-label': t('passport.label'), hidden: true },
    h('p', { class: 'dd-title', 'aria-hidden': 'true' }, t('passport.title')), input, list);
  host.replaceChildren(btn, menu);
  host.classList.add('dd');

  let all = [];
  const label = () => {
    const cur = all.find((p) => p.code === passport);
    btn.querySelector('.pp-label').textContent = passport ? `${flagEmoji(passport)} ${cur ? cur.name : passport}` : t('passport.label');
    btn.classList.toggle('is-off', !passport);
  };
  const option = (code, text) => h('button', { type: 'button', class: 'dd-opt pp-opt', 'aria-pressed': String(code === passport),
    onclick: () => { closeMenus(); setPassport(code); } }, text);
  const render = () => {
    const q = fold(input.value).trim();
    const words = q.split(/\s+/).filter(Boolean);
    let found = all.filter((p) => words.every((w) => p.find.includes(w)));
    // names that start with the typed text first: «ru» → Russia before Peru
    if (q) found = [...found.filter((p) => p.find.split(' ').some((w) => w.startsWith(words[0]))), ...found.filter((p) => !p.find.split(' ').some((w) => w.startsWith(words[0])))];
    list.replaceChildren(...[
      q ? null : option('', t('passport.none')),
      ...found.map((p) => option(p.code, `${flagEmoji(p.code)} ${p.name}`)),
      found.length ? null : h('p', { class: 'pp-empty' }, t('passport.nothing')),
    ].filter(Boolean));
  };
  const fill = () => { all = passportList(); label(); render(); };
  fill();
  visaReady.then(fill);

  const open = () => {
    closeMenus();
    input.value = ''; render();
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    fitMenu(menu);
    input.focus({ preventScroll: true });
    // scroll the list only (scrollIntoView would also scroll the phone sheet behind the menu)
    const cur = list.querySelector('[aria-pressed="true"]');
    if (cur) list.scrollTop = cur.offsetTop - list.offsetTop - (list.clientHeight - cur.offsetHeight) / 2;
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) open(); else closeMenus({ focusButton: true }); });
  input.addEventListener('input', () => { render(); list.scrollTop = 0; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.pp-opt')?.click(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.pp-opt')?.focus(); }
  });
  list.addEventListener('keydown', (e) => {
    const opts = [...list.querySelectorAll('.pp-opt')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { (opts[i + 1] || opts[i])?.focus(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { (i > 0 ? opts[i - 1] : input).focus(); e.preventDefault(); }
  });
  // taps on the list must not take focus away from the menu (WebKit), but the search field must stay tappable
  menu.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
  closeOnFocusLeave(host, menu, btn);
}

// ---------- first visit: choose the sport ---------------------------------------------
const PICK_ICONS = {
  kite: '<path d="M8 15c2-7 9-11 16-10-4 3-6 7-6 12" /><path d="M8 15c3 0 7 1 10 2" /><path d="M8 15l6 12M18 17l-4 10" /><path d="M11 27h6" />',
  surf: '<path d="M4 22c4 0 6-3 8-7s5-7 10-7c3 0 6 2 6 5-3-2-7 0-7 4 0 3 3 5 7 5" /><path d="M4 27c3 0 4-1.5 6-1.5S13 27 16 27s4-1.5 6-1.5 3 1.5 6 1.5" />',
  windsurf: '<path d="M15 4c5 5 8 12 7 19H12z" /><path d="M15 4v19" /><path d="M7 26h20" /><path d="M4 29c3 0 4-1 6-1s3 1 6 1 4-1 6-1 3 1 6 1" />',
  snowboard: '<path d="M3 26l9-14 5 7 4-5 8 12z" /><path d="M9.5 16l2.5 2 2-1.5" /><path d="M21 14l2 3" />',
  climbing: '<rect x="8" y="5" width="12" height="22" rx="6" /><path d="M14 9v14" /><path d="M14 13l4-2" />',
  diving: '<path d="M4 11h20v6a4 4 0 0 1-4 4h-2.5l-2-3h-3l-2 3H8a4 4 0 0 1-4-4z" /><path d="M14 11v4" /><path d="M28 7v13a6 6 0 0 1-6 6h-3" />',
  sailing: '<path d="M15 4v19" /><path d="M15 5c4 4 7 10 7 16h-7z" /><path d="M13 8c-3 4-5 8-6 13h6z" /><path d="M5 23h20l-3 4H8z" />',
  viaferrata: '<path d="M4 28h6v-6h6v-6h6v-6h6" /><path d="M4 20L26 4" /><circle cx="10" cy="15.6" r="1.4" /><circle cx="19" cy="9.1" r="1.4" />',
  bungee: '<path d="M6 5h20" /><path d="M10 5v4M22 5v4" /><path d="M16 5c-3 4 3 6 0 10s3 6 0 8" /><circle cx="16" cy="26" r="2.2" />',
  paragliding: '<path d="M4 11c3-5 21-5 24 0" /><path d="M4 11c4-1.5 20-1.5 24 0" /><path d="M5 11l9 13M27 11l-9 13M12 11l2 13M20 11l-2 13" /><circle cx="16" cy="26" r="2" />',
};
function showSportPicker({ change = false } = {}) {
  const acts = state.activities.filter((a) => a.enabled && ACT[a.id]);
  if (acts.length < 2 || document.querySelector('.picker')) return false;
  const opener = document.activeElement;
  const tiles = acts.map((a) => h('button', { type: 'button', class: `picker-tile${change && a.id === state.activity ? ' is-current' : ''}`, 'data-a': a.id,
    'aria-pressed': change ? String(a.id === state.activity) : null, onclick: () => close(a.id) },
    h('span', { class: 'picker-icon', 'aria-hidden': 'true', html: `<svg viewBox="0 0 32 32">${PICK_ICONS[a.id] || PICK_ICONS.kite}</svg>` }),
    h('span', { class: 'picker-name' }, sportName(a.id)),
    h('span', { class: 'picker-meta' }, [a.spots ? spotsWord(a.spots) : null, t(`pick.tag.${a.id}`)].filter(Boolean).join(' · '))));
  const skip = h('button', { type: 'button', class: 'picker-skip', onclick: () => close(null) }, t(change ? 'pick.cancel' : 'pick.skip'));
  const dlg = h('div', { class: 'picker', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'picker-title', 'aria-describedby': 'picker-sub',
    onclick: (e) => { if (change && e.target === dlg) close(null); } },
    h('div', { class: 'picker-card' },
      h('button', { type: 'button', class: 'picker-x', 'aria-label': t('about.close'), onclick: () => close(null) }, '×'),
      h('h2', { id: 'picker-title' }, t(change ? 'dd.activity.title' : 'pick.title')),
      h('p', { id: 'picker-sub', class: 'picker-sub' }, t(change ? 'pick.sub_change' : 'pick.sub')),
      h('div', { class: 'picker-grid' }, ...tiles),
      skip));
  const focusables = () => [...dlg.querySelectorAll('button')];
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
  };
  function close(a) {
    dlg.remove();
    document.removeEventListener('keydown', onKey, true);
    document.querySelector('.app').removeAttribute('inert');
    if (!change) track('pick_sport', { activity: a || 'skip' });
    if (a && a !== state.activity) switchActivity(a);
    else if (!change) { try { localStorage.setItem('activity', state.activity); } catch { /* ignore */ } writeHash(); }
    if (change && opener && opener.isConnected) opener.focus({ preventScroll: true });
    else focusSearch();
  }
  document.addEventListener('keydown', onKey, true);
  document.querySelector('.app').setAttribute('inert', '');
  document.body.append(dlg);
  (tiles.find((b) => b.dataset.a === state.activity) || tiles[0]).focus({ preventScroll: true });
  return true;
}
const spotsWord = (n) => tn('n.spots', n);

async function boot() {
  document.querySelector('#seo')?.remove();   // the static text for search engines: the app shows the same, live
  initAnalytics();
  initLanguage();
  injectFlagCSS();
  onMapNotice(toast);
  const spotFromHash = readHash();
  initMap(state, select);
  initControls();
  applyActivityUI();
  refresh();
  try {
    const meta = await loadMeta();
    if (meta && Array.isArray(meta.activities)) state.activities = meta.activities;
  } catch { /* old server or no meta: kite only */ }
  if (!state.activities.some((a) => a.id === state.activity && a.enabled)) state.activity = 'kite';
  applyActivityUI();
  const picking = !spotFromHash && !state.activityFromUrl && !savedActivity && showSportPicker();
  if (!spotFromHash && !picking) writeHash();   // the picker writes the address once a sport is chosen
  try {
    await Promise.all([loadActivitySpots(), loadSpotTexts()]);
    if (spotFromHash) select(spotFromHash);
  } catch { /* the list shows the error */ }
}

boot();
