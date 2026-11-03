// Map: basemap styles, flag markers, hover tooltip, selection.
import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps.js';
import { flagImage } from './flags.js';
import { MONTHS_IN, PHONE_QUERY, SEASON, VISA, cm, esc, flagEmoji, metres, rating, windText, vibeLabel } from './util.js';
import { isRu, lang, t } from './i18n.js';

const INK = '#12303f';
const SRC = 'spots';
let map;
let state;           // shared app state (month, filters, selected)
let onSelect = () => {};
let geojson = { type: 'FeatureCollection', features: [] };
let hoverId = null;
let tip;

function addIcons() {
  for (const kind of ['peak', 'shoulder', 'snow', 'off']) {
    const id = `flag-${kind}`;
    if (!map.hasImage(id)) map.addImage(id, flagImage(kind), { pixelRatio: 2 });
  }
}

// --- basemap labels in the interface language ---------------------------------------
function russify() {
  const style = map.getStyle();
  for (const layer of style.layers) {
    if (layer.type !== 'symbol' || layer.source === SRC) continue;
    const tf = map.getLayoutProperty(layer.id, 'text-field');
    if (!tf) continue;
    const s = JSON.stringify(tf);
    if (!/name/.test(s) || /ref|housenumber/.test(layer.id)) continue;
    try {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${lang}`], ['get', `name_${lang}`], ['get', 'name:latin'], ['get', 'name']]);
    } catch { /* some styles use tokens we can't override; keep them */ }
  }
}

function tint(cfg) {
  if (!cfg.tint) return;
  for (const layer of map.getStyle().layers) {
    for (const [pattern, props] of cfg.tint) {
      if (!pattern.test(layer.id)) continue;
      for (const [prop, value] of Object.entries(props)) {
        if (!prop.startsWith(layer.type)) continue;
        try { map.setPaintProperty(layer.id, prop, value); } catch { /* not applicable */ }
      }
    }
  }
}

// --- spot layers -----------------------------------------------------------------
const sizeExpr = () => {
  const r = ['coalesce', ['get', 'rating'], 3.6];
  const off = ['case', ['==', ['get', 'season'], 'off'], 0.88, 1];
  const base = ['*', off, ['+', 0.62, ['*', ['-', ['max', ['min', r, 5], 3], 3], 0.24]]];   // 0.62 … 1.10
  return ['interpolate', ['linear'], ['zoom'], 1, ['*', base, 0.74], 4, ['*', base, 0.88], 8, base, 12, ['*', base, 1.2]];
};

function addSpotLayers(cfg) {
  addIcons();
  if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: geojson, promoteId: 'id' });

  if (map.getLayer('spot-flags')) { applyFilter(); return; }
  map.addLayer({        // halo under the pole base: hover + selection
    id: 'spot-halo', type: 'circle', source: SRC,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 9, 8, 15],
      'circle-color': '#145d78',
      'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.35,
        ['boolean', ['feature-state', 'hover'], false], 0.22, 0],
      'circle-stroke-color': '#145d78',
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
      'circle-pitch-alignment': 'map',
    },
  });
  map.addLayer({
    id: 'spot-flags', type: 'symbol', source: SRC,
    layout: {
      'icon-image': ['concat', 'flag-', ['get', 'season']],
      'icon-size': sizeExpr(),
      'icon-anchor': 'bottom-left',
      'icon-offset': [-9, 4],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['==', ['get', 'season'], 'off'], -1, ['coalesce', ['get', 'rating'], 0]],
      'symbol-z-order': 'source',
    },
    paint: { 'icon-opacity': ['case', ['==', ['get', 'season'], 'off'], 0.82, 1] },
  });
  if (map.getStyle().glyphs) map.addLayer({
    id: 'spot-labels', type: 'symbol', source: SRC, minzoom: 4.5,
    layout: {
      'text-field': ['get', 'name_ru'],
      'text-font': cfg.labelFont || ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 13.5],
      'text-anchor': 'left',
      'text-offset': [1.9, -1.4],
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: {
      'text-color': cfg.dark ? '#ffffff' : INK,
      'text-halo-color': cfg.dark ? 'rgba(10,30,40,0.85)' : 'rgba(255,255,255,0.92)',
      'text-halo-width': 1.6,
    },
  });
  applyFilter();
  if (state.selected) { selectedId = null; setSelected(state.selected, false); }
}

export function applyFilter() {
  if (!map || !map.getLayer('spot-flags')) return;
  // the selected spot stays visible even if its season is switched off
  // while searching by name every match is drawn (the data is already filtered by the query)
  const f = state.query ? null : ['any', ['in', ['get', 'season'], ['literal', state.seasonsOn()]], ['==', ['get', 'id'], state.selected || '']];
  map.setFilter('spot-flags', f);
  if (map.getLayer('spot-labels')) map.setFilter('spot-labels', f);
  map.setFilter('spot-halo', f);
}

export function clearHover() {
  if (map && map.getSource(SRC) && hoverId) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
  hoverId = null;
  if (tip) tip.remove();
}

export function setData(features) {
  geojson = { type: 'FeatureCollection', features };
  const src = map && map.getSource(SRC);
  if (src) src.setData(geojson);
}

let selectedId = null;
export function setSelected(id, fly = true) {
  if (!map || !map.getSource(SRC)) { selectedId = id; return; }
  if (selectedId && selectedId !== id) map.setFeatureState({ source: SRC, id: selectedId }, { selected: false });
  selectedId = id || null;
  applyFilter();
  if (!id) return;
  map.setFeatureState({ source: SRC, id }, { selected: true });
  const f = geojson.features.find((x) => x.properties.id === id);
  if (fly && f) {
    const z = Math.max(map.getZoom(), 6.5);
    map.easeTo({ center: f.geometry.coordinates, zoom: z, padding: viewPadding(), duration: 900 });
  }
}

// Map padding = the part of the screen covered by floating panels, so centring happens in the free area.
function viewPadding() {
  if (window.matchMedia(PHONE_QUERY).matches) {
    const app = document.querySelector('.app');
    const h = window.innerHeight;
    if (app.classList.contains('has-panel')) return { left: 0, right: 0, top: 10, bottom: Math.round(h * 0.82) };
    const sheet = app.classList.contains('side-collapsed') ? 0 : document.querySelector('.side').offsetHeight;
    return { left: 0, right: 0, top: 70, bottom: Math.min(Math.round(h * 0.8), sheet + 150) };
  }
  const app = document.querySelector('.app');
  const side = document.querySelector('.side');
  const panel = document.querySelector('.panel');
  const left = app.classList.contains('side-collapsed') ? 0 : side.offsetWidth + 16;
  const right = app.classList.contains('has-panel') ? panel.offsetWidth + 16 : 0;
  return { left, right, top: 70, bottom: 90 };
}
export function updatePadding(animate = true) {
  if (!map) return;
  if (animate) map.easeTo({ padding: viewPadding(), duration: 350 });
  else map.setPadding(viewPadding());
}

function tipHtml(p) {
  const m = state.month;
  const season = SEASON[p.season] || SEASON.off;
  const visa = isRu && p.visa_status ? VISA[p.visa_status] : null;
  return `<div class="tip-name">${esc(p.name_ru)}</div>
    <div class="tip-place">${flagEmoji(p.cc)} ${esc(p.country || '')}</div>
    <div class="tip-row"><span class="tip-rating">★ ${rating(p.rating)}</span>
      <span class="tip-season tip-${p.season}">${season.phrase || season.short} ${MONTHS_IN[m - 1]}</span></div>
    <div class="tip-row tip-muted">${[
    p.snow != null ? t('tip.snow', { v: cm(p.snow) })
      : p.swell != null ? t('tip.swell', { v: metres(p.swell), s: p.period != null ? Math.round(p.period) : '—' })
        : (p.wind != null ? t('tip.wind', { v: windText(p.wind) }) : ''),
    p.air != null ? t('tip.air', { v: Math.round(p.air) }) : '', p.sea != null ? t('tip.sea', { v: Math.round(p.sea) }) : '',
    p.dry != null ? t('tip.dry', { v: Math.round(p.dry) }) : '', p.fly != null ? t('tip.fly', { v: Math.round(p.fly) }) : ''].filter(Boolean).join(', ')}</div>
    ${visa || p.vibe ? `<div class="tip-row">${visa ? `<span class="tip-visa tone-${visa.tone}">${esc(visa.label)}</span>` : ''}${p.vibe ? `<span class="tip-vibe">${esc(t('tip.vibe', { v: vibeLabel(p.vibe) }))}</span>` : ''}</div>` : ''}`;
}

function bindEvents() {
  tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [6, -34], className: 'spot-tip', maxWidth: '260px' });
  map.on('mousemove', 'spot-flags', (e) => {
    const f = e.features[0];
    map.getCanvas().style.cursor = 'pointer';
    if (hoverId !== f.id) {
      if (hoverId) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
      hoverId = f.id;
      map.setFeatureState({ source: SRC, id: hoverId }, { hover: true });
      tip.setLngLat(f.geometry.coordinates).setHTML(tipHtml(f.properties)).addTo(map);
    }
  });
  map.on('mouseleave', 'spot-flags', () => {
    map.getCanvas().style.cursor = '';
    if (hoverId) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
    hoverId = null;
    tip.remove();
  });
  document.addEventListener('hover-spot', (e) => {
    if (!map.getSource(SRC)) return;
    if (hoverId) map.setFeatureState({ source: SRC, id: hoverId }, { hover: false });
    hoverId = e.detail;
    if (hoverId) map.setFeatureState({ source: SRC, id: hoverId }, { hover: true });
  });
  map.on('click', 'spot-flags', (e) => {
    tip.remove();
    onSelect(e.features[0].properties.id);
  });
}

let currentBasemap = DEFAULT_BASEMAP;
let bmToken = 0;
let notify = () => {};
export function onMapNotice(fn) { notify = fn; }
export function setBasemap(id, { revertTo = null } = {}) {
  const cfg = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
  const previous = currentBasemap;
  const token = ++bmToken;
  currentBasemap = cfg.id;
  map.setStyle(typeof cfg.style === 'function' ? cfg.style() : cfg.style, { diff: false });
  // If the style can't be fetched (no internet, server down) go back to the previous one.
  const timer = setTimeout(() => {
    if (token !== bmToken) return;
    notify(t('bm.failed', { name: cfg.name }));
    if (!revertTo) setBasemap(previous, { revertTo: previous });
  }, 10000);
  map.once('style.load', () => {
    if (token !== bmToken) return;   // a newer switch already happened
    clearTimeout(timer);
    try { localStorage.setItem('basemap', cfg.id); } catch { /* ignore */ }
    russify(); tint(cfg); addSpotLayers(cfg);
    document.documentElement.dataset.basemap = cfg.dark ? 'dark' : 'light';
    document.dispatchEvent(new CustomEvent('basemap-changed', { detail: cfg.id }));
  });
}
export const getBasemap = () => currentBasemap;

export function initMap(appState, selectHandler) {
  state = appState;
  onSelect = selectHandler;
  let saved = DEFAULT_BASEMAP;
  try { if (DEFAULT_BASEMAP !== 'offline') saved = localStorage.getItem('basemap') || DEFAULT_BASEMAP; } catch { /* ignore */ }
  const cfg = BASEMAPS.find((b) => b.id === saved) || BASEMAPS[0];
  currentBasemap = cfg.id;
  map = new maplibregl.Map({
    container: 'map',
    style: typeof cfg.style === 'function' ? cfg.style() : cfg.style,
    center: [20, 28], zoom: 1.9, minZoom: 1.2, maxZoom: 16,
    attributionControl: false,
    renderWorldCopies: true,
    dragRotate: false, pitchWithRotate: false,
    locale: t('maplibre'),
  });
  map.touchZoomRotate.disableRotation();
  map.setPadding(viewPadding());
  const attribution = new maplibregl.AttributionControl({ compact: true });
  map.addControl(attribution, 'bottom-left');
  // MapLibre opens the compact attribution on load; keep it folded to the (i) button so it never hides under the month strip
  map.once('load', () => document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  let loaded = false;
  map.once('style.load', () => {
    loaded = true;
    russify(); tint(cfg); addSpotLayers(cfg);
    document.documentElement.dataset.basemap = cfg.dark ? 'dark' : 'light';
  });
  // saved basemap unreachable -> fall back to the default one
  setTimeout(() => { if (!loaded && cfg.id !== DEFAULT_BASEMAP) setBasemap(DEFAULT_BASEMAP, { revertTo: DEFAULT_BASEMAP }); }, 10000);
  bindEvents();
  window.__map = map;
  return map;
}

export function fitToSpots(features) {
  if (!features.length) return;
  const b = new maplibregl.LngLatBounds();
  features.forEach((f) => b.extend(f.geometry.coordinates));
  const side = document.querySelector('.side');
  map.fitBounds(b, { padding: { top: 120, bottom: 160, left: (side ? side.offsetWidth : 0) + 60, right: 60 }, maxZoom: 6, duration: 800 });
}

export const getMap = () => map;
