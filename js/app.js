// Kite Atlas — app entry: state, data loading, sidebar list, month strip.
import { BASEMAPS } from './basemaps.js';
import { injectFlagCSS } from './flags.js';
import { applyFilter, clearHover, getBasemap, initMap, onMapNotice, setBasemap, setData, setSelected, updatePadding } from './map.js';
import { closePanel, currentSpot, renderPanel, showPanelError } from './panel.js';
import { LANGS, applyStatic, isRu, lang, loadSpotTexts, localizeSpot, num, setLang, t, tn } from './i18n.js';
import {
  MONTHS, MONTHS_IN, MONTHS_SHORT, PHONE_QUERY, SEASON, VISA, esc, flagEmoji, getUnit, h, rating, setUnit, spots as spotsText, windText,
} from './util.js';

const state = {
  month: new Date().getMonth() + 1,
  activity: 'kite',
  seasons: { peak: true, shoulder: true, snow: true, off: false },
  filters: { novisa: false, ru: false, flat: false, minRating: null, minAir: null, minWater: null, vibe: null, pop: null },
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
const loadSpots = () => getJSON(`/api/spots?activity=${state.activity}`, `data/spots-${state.activity}.json`);
const loadSpot = async (id) => localizeSpot(await getJSON(`/api/spots/${encodeURIComponent(id)}`, `data/spot/${encodeURIComponent(id)}.json`));

// ---------- filtering -----------------------------------------------------------
function passesFilters(s, m = state.month) {
  const f = state.filters;
  if (f.novisa && state.spots.some((x) => x.visa) && !(s.visa && ['home', 'no_visa', 'visa_on_arrival', 'evisa'].includes(s.visa.status))) return false;
  if (f.ru && s.ru_schools !== 'yes') return false;
  if (f.flat && !(s.water || []).includes('flat')) return false;
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
const anyFilter = () => {
  const f = state.filters;
  const seasonsChanged = !state.seasons.peak || !state.seasons.shoulder || !state.seasons.snow || state.seasons.off;
  return seasonsChanged || f.novisa || f.ru || f.flat || f.minRating != null || f.minAir != null || f.minWater != null || !!f.vibe || !!f.pop || !!state.query;
};

function features() {
  return state.spots.filter((s) => passesFilters(s) || s.id === state.selected).map((s) => ({
    type: 'Feature',
    id: s.id,
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: {
      id: s.id, name_ru: s.name_ru, cc: s.cc, country: s.country, rating: s.rating,
      season: seasonOf(s), wind: s.wind[state.month - 1],
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
  const f = state.filters;
  const seasonsChanged = !state.seasons.peak || !state.seasons.shoulder || !state.seasons.snow || state.seasons.off;
  return [seasonsChanged, f.novisa, f.ru, f.flat, f.minRating != null, f.minAir != null, f.minWater != null, !!f.vibe, !!f.pop].filter(Boolean).length;
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
      title: t('strip.title', { month: MONTHS[i], peak: c.peak, shoulder: c.shoulder, snow: c.snow }),
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
  for (const k of ['peak', 'shoulder', 'snow', 'off']) {
    host.append(h('button', {
      type: 'button', class: `sc sc-${k} ${state.seasons[k] ? 'is-on' : ''}`, 'aria-pressed': state.seasons[k] ? 'true' : 'false', 'data-fk': `sc-${k}`,
      title: t(state.seasons[k] ? 'sc.hide' : 'sc.show', { label: SEASON[k].label }),
      onclick: () => { state.seasons[k] = !state.seasons[k]; refresh(); },
    }, h('span', { class: `flag-ico flag-${k}`, 'aria-hidden': 'true' }), h('span', { class: 'sc-label' }, SEASON_SHORT[k]), h('span', { class: 'sc-count' }, String(counts[k]))));
  }
}

function listRow(s) {
  const k = seasonOf(s);
  const visa = isRu && s.visa ? VISA[s.visa.status] : null;
  const w = s.wind[state.month - 1];
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
    h('span', { class: 'row-wind' }, w != null ? windText(w) : ''),
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
  if (isPhone()) centreCurrentMonth();
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
const panelCtx = () => ({ month: state.month, setMonth });

async function select(id, { focusCard = false, from = null } = {}) {
  if (!id) {
    const wasOpen = !!state.selected;
    state.selected = null; closePanel(); setSelected(null); renderList(); writeHash();
    updatePadding(true);
    if (state.sideAuto) { setSide(true); state.sideAuto = false; }
    if (wasOpen) {
      const back = opener && document.querySelector(`[data-fk="${CSS.escape(opener)}"]`);
      (back && back.offsetParent ? back : document.querySelector('#search')).focus({ preventScroll: true });
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
  try {
    const spot = await loadSpot(id);
    if (state.selected !== id) return;
    renderPanel(spot, panelCtx());
    setSelected(id, true);
    if (focusCard) document.querySelector('#panel-title')?.focus({ preventScroll: true });
  } catch (e) {
    if (state.selected === id) { setSelected(null); showPanelError(t('err.spot', { msg: e.message })); }
  } finally {
    panel.classList.remove('is-loading');
  }
}

// ---------- URL state ------------------------------------------------------------
function writeHash() {
  const p = new URLSearchParams({ m: String(state.month) });
  if (state.selected) p.set('spot', state.selected);
  const next = `#${p.toString()}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const m = Number(p.get('m'));
  if (Number.isInteger(m) && m >= 1 && m <= 12) state.month = m;
  return p.get('spot');
}

// ---------- sidebar --------------------------------------------------------------
const isSideOpen = () => !document.querySelector('.app').classList.contains('side-collapsed');
function setSide(open, { moveFocus = false, persist = false } = {}) {
  document.querySelector('.app').classList.toggle('side-collapsed', !open);
  document.querySelector('.side').inert = !open;
  if (moveFocus) (open ? document.querySelector('.side-toggle') : document.querySelector('.side-open')).focus();
  if (persist) { try { localStorage.setItem('side', open ? 'open' : 'closed'); } catch { /* ignore */ } }
  setTimeout(() => updatePadding(true), 30);
}

// ---------- dropdown filters (rating, temperatures, activity) -------------------------
const DROPDOWNS = [
  {
    key: 'activity', label: () => t('dd.activity.label'), title: t('dd.activity.title'),
    options: [
      { value: 'kite', text: t('dd.activity.kite') },
      ...['windsurf', 'surf', 'snowboard', 'climbing'].map((v) => ({ value: v, text: t(`dd.activity.${v}`), disabled: true })),
    ],
    get: () => 'kite', set: () => {}, active: () => false,
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
    key: 'minWater', title: t('dd.water.title'),
    label: (v) => (v == null ? t('dd.water.label') : t('dd.water.label_v', { v })),
    options: [{ value: null, text: t('dd.any_f') }, ...[16, 20, 24, 27].map((v) => ({ value: v, text: t(`dd.water.${v}`) }))],
  },
];

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
  // a click on the menu's heading or padding must not steal focus (that would close the menu)
  menu.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) e.preventDefault(); });
}

function initDropdowns() {
  const host = document.querySelector('.dropdowns');
  for (const d of DROPDOWNS) {
    const id = `dd-${d.key}`;
    const btn = h('button', { type: 'button', class: `dd-btn ${d.key === 'activity' ? 'dd-activity' : ''}`, title: d.title, 'aria-expanded': 'false', 'aria-controls': id },
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
      if (open) (menu.querySelector('.dd-opt[aria-pressed="true"]') || menu.querySelector('.dd-opt:not(:disabled)'))?.focus();
    });
    const wrap = h('div', { class: 'dd', 'data-key': d.key }, btn, menu);
    // close when keyboard focus leaves the dropdown
    wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget) && !menu.hidden) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    menuKeys(menu, '.dd-opt:not(:disabled)');
    (d.key === 'activity' ? document.querySelector('.dd-host[data-slot="activity"]') : host).append(wrap);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.dd, .basemaps')) closeMenus(); });
}

// ---------- controls ---------------------------------------------------------------
function initControls() {
  document.querySelector('.prev').addEventListener('click', () => setMonth(state.month - 1));
  document.querySelector('.next').addEventListener('click', () => setMonth(state.month + 1));
  document.querySelector('.panel-close').addEventListener('click', () => select(null));
  document.querySelector('.side-toggle').addEventListener('click', () => { state.sideAuto = false; setSide(false, { moveFocus: true, persist: true }); });
  document.querySelector('.side-open').addEventListener('click', () => { state.sideAuto = false; setSide(true, { moveFocus: true, persist: true }); });
  if (isPhone()) setSide(false);   // phones start with the map; the bar at the bottom opens the list
  else { try { if (localStorage.getItem('side') === 'closed') setSide(false); } catch { /* ignore */ } }
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
  document.querySelector('.reset').addEventListener('click', () => {
    Object.assign(state.filters, { novisa: false, ru: false, flat: false, minRating: null, minAir: null, minWater: null, vibe: null, pop: null });
    Object.assign(state.seasons, { peak: true, shoulder: true, snow: true, off: false });
    state.query = ''; document.querySelector('#search').value = '';
    document.querySelectorAll('.qf').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    refresh();
    document.querySelector('#search').focus();
  });
  const search = document.querySelector('#search');
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
    if (open) menu.querySelector('[aria-pressed="true"]')?.focus();
  });
  bm.addEventListener('focusout', (e) => { if (!bm.contains(e.relatedTarget) && !menu.hidden) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });
  menuKeys(menu, 'button');
  paintToggle();
  bm.append(toggle, menu);
  document.addEventListener('basemap-changed', () => {
    paintToggle();
    menu.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === getBasemap() ? 'true' : 'false'));
  });

  // month strip as a proper radio group: arrows / Home / End move the selection and the focus
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
    const id = readHash();
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
  // visas and Russian-speaking schools only matter to Russian travellers
  if (!isRu) document.querySelectorAll('.qf[data-filter="novisa"], .qf[data-filter="ru"]').forEach((b) => b.remove());
  const select = document.querySelector('#lang');
  for (const l of LANGS) select.append(h('option', { value: l.code, selected: l.code === lang }, l.name));
  select.addEventListener('change', () => setLang(select.value));
}

async function boot() {
  initLanguage();
  injectFlagCSS();
  onMapNotice(toast);
  const spotFromHash = readHash();
  initMap(state, select);
  initControls();
  refresh();
  try {
    const [data] = await Promise.all([loadSpots(), loadSpotTexts()]);
    state.spots = data.spots.map(localizeSpot);
    lastAnnounced = null;   // announce the real counts once the data is in
    refresh();
    if (spotFromHash) select(spotFromHash);
  } catch (e) {
    state.loadError = true;
    refresh();
    document.querySelector('.spot-list').innerHTML = `<li class="empty error">${esc(t('list.spots_error', { msg: e.message }))}</li>`;
  }
}

boot();
