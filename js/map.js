// Map: basemap styles, flag markers, hover tooltip, selection.
import { BASEMAPS, DEFAULT_BASEMAP, FALLBACK_BASEMAP } from './basemaps.js';
import { flagImage } from './flags.js';
import { MONTHS_IN, PHONE_QUERY, SEASON, VISA, cm, esc, flagEmoji, metres, rating, windText, vibeLabel } from './util.js';
import { lang, t, tn } from './i18n.js';
import { PICK_ICONS, SPORTS, SPORT_COLOR } from './sports.js';

const INK = '#12303f';
const SRC = 'spots';
const MIX = 'mix';            // «All sports»: every sport at once, clustered
let mixMode = false;
let mixGeojson = { type: 'FeatureCollection', features: [] };
const SPOT_LAYERS = ['spot-halo', 'spot-flags', 'spot-labels'];
const MIX_LAYERS = ['mix-halo', 'mix-pins', 'mix-labels'];
const curSrc = () => (mixMode ? MIX : SRC);
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
    if (layer.type !== 'symbol' || layer.source === SRC || layer.source === MIX) continue;
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
  addMixLayers(cfg);
  if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: geojson, promoteId: 'id' });

  if (map.getLayer('spot-flags')) { applyFilter(); applyMode(); return; }
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
  applyMode();
  if (state.selected) {
    selectedId = null;
    setSelected(mixMode && state.spotAct ? `${state.spotAct}:${state.selected}` : state.selected, false);
  }
}

// --- «All sports»: round pins in the sport's colour, and clusters that fall apart as you zoom in -----------------
const pinImages = {};
function pinSvg(a) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20.5" fill="${SPORT_COLOR[a]}" stroke="#fff" stroke-width="3"/>`
    + `<g transform="translate(10.5 10.5) scale(0.84)" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">${PICK_ICONS[a]}</g></svg>`;
}
function pinImage(a) {
  if (!pinImages[a]) {
    const img = new Image(48, 48);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(a))}`;
    pinImages[a] = img.decode().then(() => img);
  }
  return pinImages[a];
}
function addPins() {
  for (const a of SPORTS) {
    pinImage(a).then((img) => { if (map && !map.hasImage(`pin-${a}`)) map.addImage(`pin-${a}`, img, { pixelRatio: 2 }); }).catch(() => {});
  }
}

function addMixLayers(cfg) {
  addPins();
  if (!map.getSource(MIX)) {
    map.addSource(MIX, {
      type: 'geojson', data: mixGeojson, promoteId: 'key', cluster: true, clusterMaxZoom: 6, clusterRadius: 52,
      clusterProperties: Object.fromEntries(SPORTS.map((a) => [a, ['+', ['case', ['==', ['get', 'a'], a], 1, 0]]])),
    });
  }
  if (map.getLayer('mix-pins')) return;
  const single = ['!', ['has', 'point_count']];
  const vis = mixMode ? 'visible' : 'none';
  map.addLayer({
    id: 'mix-halo', type: 'circle', source: MIX, filter: single, layout: { visibility: vis },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 13, 10, 17],
      'circle-color': '#145d78',
      'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.35, ['boolean', ['feature-state', 'hover'], false], 0.25, 0],
      'circle-stroke-color': '#145d78',
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
      'circle-pitch-alignment': 'map',
    },
  });
  map.addLayer({
    id: 'mix-pins', type: 'symbol', source: MIX, filter: single,
    layout: {
      visibility: vis,
      'icon-image': ['concat', 'pin-', ['get', 'a']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 7, 0.95, 11, 1.15],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['==', ['get', 'season'], 'peak'], ['+', 10, ['coalesce', ['get', 'rating'], 0]], ['coalesce', ['get', 'rating'], 0]],
      'symbol-z-order': 'source',
    },
    // a prime season is drawn solid, a shoulder one paler, an off-season place (only while «Не сезон» is on) faint
    paint: { 'icon-opacity': ['match', ['get', 'season'], 'peak', 1, 'off', 0.42, 0.7] },
  });
  if (map.getStyle().glyphs) {
    map.addLayer({
      id: 'mix-labels', type: 'symbol', source: MIX, filter: single, minzoom: 7,
      layout: {
        visibility: vis,
        'text-field': ['get', 'name_ru'], 'text-font': cfg.labelFont || ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 11, 13.5],
        'text-anchor': 'left', 'text-offset': [1.15, 0], 'text-optional': true, 'text-max-width': 9,
      },
      paint: { 'text-color': cfg.dark ? '#ffffff' : INK, 'text-halo-color': cfg.dark ? 'rgba(10,30,40,0.85)' : 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6 },
    });
  }
}

function applyMode() {
  if (!map || !map.getLayer('spot-flags')) return;
  for (const id of SPOT_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', mixMode ? 'none' : 'visible');
  for (const id of MIX_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', mixMode ? 'visible' : 'none');
  if (!mixMode) clearClusters();
  else scheduleClusters();
}

// cluster badges: HTML markers with a ring split by sport (the chips in the list are the legend) and the total inside
const clusterMarkers = new Map();
let clusterFrame = null;
function scheduleClusters() {
  if (clusterFrame) return;
  clusterFrame = requestAnimationFrame(() => { clusterFrame = null; updateClusters(); });
}
function clearClusters() {
  for (const m of clusterMarkers.values()) m.remove();
  clusterMarkers.clear();
  if (ctip) ctip.remove();
}
let ctip = null;   // the cluster tip (its own popup: a different offset from the pin tip)
function ringSvg(props, size) {
  const parts = SPORTS.map((a) => [a, props[a] || 0]).filter((x) => x[1] > 0);
  const total = parts.reduce((n, x) => n + x[1], 0) || 1;
  const w = Math.max(5, Math.round(size * 0.17));
  const r = size / 2 - w / 2 - 1;
  const c = 2 * Math.PI * r;
  let at = 0;
  const arcs = parts.map(([a, n]) => {
    const len = (n / total) * c;
    const arc = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${SPORT_COLOR[a]}" stroke-width="${w}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"/>`;
    at += len;
    return arc;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle r="${size / 2 - 1}" cx="${size / 2}" cy="${size / 2}" fill="#fff"/>`
    + `<g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g></svg>`;
}
function clusterTip(props) {
  const rows = SPORTS.map((a) => [a, props[a] || 0]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1])
    .map(([a, n]) => `<div class="tip-sport"><i style="background:${SPORT_COLOR[a]}"></i>${esc(t(`sport.${a}`))}<b>${n}</b></div>`).join('');
  return `<div class="tip-name">${esc(tn('n.spots', props.point_count))}</div>${rows}<div class="tip-row tip-muted">${esc(t('mix.cluster_hint'))}</div>`;
}
function updateClusters() {
  if (!mixMode || !map.getSource(MIX) || !map.isSourceLoaded(MIX)) return;
  const seen = new Set();
  for (const f of map.querySourceFeatures(MIX)) {
    const p = f.properties;
    if (!p.cluster) continue;
    const id = p.cluster_id;
    if (seen.has(id)) continue;
    seen.add(id);
    if (clusterMarkers.has(id)) continue;
    const n = p.point_count;
    const size = n >= 100 ? 54 : n >= 40 ? 48 : n >= 12 ? 42 : 36;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mix-cluster';
    el.style.width = el.style.height = `${size}px`;
    el.innerHTML = `${ringSvg(p, size)}<span>${n}</span>`;
    el.setAttribute('aria-label', `${tn('n.spots', n)}: ${SPORTS.filter((a) => p[a]).map((a) => `${t(`sport.${a}`)} ${p[a]}`).join(', ')}`);
    const at = f.geometry.coordinates;
    // the tip opens beside the ring, never over it (it would catch the click meant for the cluster)
    el.addEventListener('mouseenter', () => { if (!matchMedia('(pointer: coarse)').matches) ctip.setOffset(size / 2 + 6).setLngLat(at).setHTML(clusterTip(p)).addTo(map); });
    el.addEventListener('mouseleave', () => ctip.remove());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      ctip.remove();
      map.getSource(MIX).getClusterExpansionZoom(id).then((z) => {
        map.easeTo({ center: at, zoom: Math.min(z + 0.3, 12), duration: 600 });
      }).catch(() => map.easeTo({ center: at, zoom: map.getZoom() + 2, duration: 600 }));
    });
    clusterMarkers.set(id, new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map));
  }
  for (const [id, m] of clusterMarkers) if (!seen.has(id)) { m.remove(); clusterMarkers.delete(id); }
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
  if (map && map.getSource(curSrc()) && hoverId) map.setFeatureState({ source: curSrc(), id: hoverId }, { hover: false });
  hoverId = null;
  if (tip) tip.remove();
}

export function setData(features, mix = false) {
  if (mix !== mixMode) {
    clearHover();
    if (selectedId && map && map.getSource(curSrc())) map.setFeatureState({ source: curSrc(), id: selectedId }, { selected: false });
    selectedId = null;
    mixMode = mix;
    applyMode();
  }
  if (mix) {
    mixGeojson = { type: 'FeatureCollection', features };
    const src = map && map.getSource(MIX);
    if (src) src.setData(mixGeojson);
    clearClusters();   // cluster ids change with the data
    scheduleClusters();
  } else {
    geojson = { type: 'FeatureCollection', features };
    const src = map && map.getSource(SRC);
    if (src) src.setData(geojson);
  }
}

let selectedId = null;
export function setSelected(id, fly = true) {
  const S = curSrc();
  if (!map || !map.getSource(S)) { selectedId = id; return; }
  if (selectedId && selectedId !== id) map.setFeatureState({ source: S, id: selectedId }, { selected: false });
  selectedId = id || null;
  applyFilter();
  if (!id) return;
  map.setFeatureState({ source: S, id }, { selected: true });
  const f = (mixMode ? mixGeojson : geojson).features.find((x) => (mixMode ? x.properties.key : x.properties.id) === id);
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
  const visa = p.visa_status ? VISA[p.visa_status] : null;
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

function tipHtmlMix(p) {
  const season = SEASON[p.season] || SEASON.off;
  const visa = p.visa_status ? VISA[p.visa_status] : null;
  return `<div class="tip-name">${esc(p.name_ru)}</div>
    <div class="tip-place">${flagEmoji(p.cc)} ${esc(p.country || '')}</div>
    <div class="tip-row"><span class="tip-kind" style="--sc:${SPORT_COLOR[p.a]}">${esc(t(`sport.${p.a}`))}</span></div>
    <div class="tip-row"><span class="tip-rating">★ ${rating(p.rating)}</span>
      <span class="tip-season tip-${p.season}">${season.phrase || season.short} ${MONTHS_IN[state.month - 1]}</span></div>
    ${p.air != null || visa ? `<div class="tip-row tip-muted">${p.air != null ? esc(t('tip.air', { v: Math.round(p.air) })) : ''}</div>` : ''}
    ${visa ? `<div class="tip-row"><span class="tip-visa tone-${visa.tone}">${esc(visa.label)}</span></div>` : ''}`;
}

function bindEvents() {
  tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [6, -34], className: 'spot-tip', maxWidth: '260px' });
  ctip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 24, className: 'spot-tip', maxWidth: '240px' });
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
    const S = curSrc();
    if (!map.getSource(S)) return;
    if (hoverId) map.setFeatureState({ source: S, id: hoverId }, { hover: false });
    hoverId = e.detail;
    if (hoverId) map.setFeatureState({ source: S, id: hoverId }, { hover: true });
  });
  map.on('click', 'spot-flags', (e) => {
    tip.remove();
    onSelect(e.features[0].properties.id);
  });
  map.on('mousemove', 'mix-pins', (e) => {
    const f = e.features[0];
    map.getCanvas().style.cursor = 'pointer';
    if (hoverId !== f.id) {
      if (hoverId) map.setFeatureState({ source: MIX, id: hoverId }, { hover: false });
      hoverId = f.id;
      map.setFeatureState({ source: MIX, id: hoverId }, { hover: true });
      tip.setLngLat(f.geometry.coordinates).setHTML(tipHtmlMix(f.properties)).addTo(map);
    }
  });
  map.on('mouseleave', 'mix-pins', () => {
    map.getCanvas().style.cursor = '';
    if (hoverId) map.setFeatureState({ source: MIX, id: hoverId }, { hover: false });
    hoverId = null;
    tip.remove();
  });
  map.on('click', 'mix-pins', (e) => {
    tip.remove();
    onSelect(e.features[0].properties.id, { act: e.features[0].properties.a });
  });
  map.on('render', () => { if (mixMode) scheduleClusters(); });
}

let currentBasemap = DEFAULT_BASEMAP;
let bmToken = 0;

// Globe view: any basemap can be drawn as a sphere. MapLibre's "globe" turns back into the flat map by itself
// when zoomed in close (zoom 10–12). setStyle() resets the projection, so it is applied again after every style.
const PROJ_KEY = 'projection';
let globe = false;
try { globe = localStorage.getItem(PROJ_KEY) === 'globe'; } catch { /* ignore */ }
/** While the sphere is small, dark space shows around it: the month heading over it turns white (css .globe-space). */
function markSpace() {
  if (map) document.documentElement.classList.toggle('globe-space', globe && map.getZoom() < 3.2);
}
function applyProjection() {
  if (!map) return;
  document.documentElement.classList.toggle('is-globe', globe);
  markSpace();
  try {
    map.setProjection({ type: globe ? 'globe' : 'mercator' });
    // a soft blue halo around the sphere that fades out as you zoom in
    if (globe) map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 4, 0.8, 7, 0] });
  } catch { /* the style is still loading: its style.load handler applies the projection */ }
}
export const isGlobe = () => globe;
const FLAT_MIN_ZOOM = 1.2;
/** Zoom at which the whole sphere fits the free part of the map (a phone needs a smaller one than a laptop). */
function globeFitZoom(w, h) {
  const d = Math.max(200, Math.min(w, h)) * 0.88;   // sphere diameter, px
  return Math.max(0.4, Math.min(2.2, Math.log2((d * Math.PI) / 512)));
}
function freeSize() {
  const c = map.getContainer(); const p = map.getPadding();
  return [c.clientWidth - p.left - p.right, c.clientHeight - p.top - p.bottom];
}
export function setGlobe(on) {
  globe = !!on;
  try { localStorage.setItem(PROJ_KEY, globe ? 'globe' : 'flat'); } catch { /* ignore */ }
  if (map) map.setMinZoom(globe ? 0.4 : FLAT_MIN_ZOOM);
  applyProjection();
  // turning the globe on close to the ground would look like nothing happened: pull back to see the sphere
  if (globe && map) {
    const fit = globeFitZoom(...freeSize());
    if (map.getZoom() > fit + 0.6) map.easeTo({ zoom: fit, duration: 900 });
  }
  document.dispatchEvent(new CustomEvent('projection-changed', { detail: globe }));
}
let notify = () => {};
export function onMapNotice(fn) { notify = fn; }

// Where a tile server is blocked or throttled (OpenFreeMap from Russia), its style may still load while the tiles
// never arrive, leaving flags on an empty background. If no basemap tile has loaded 10 s after the style, switch to
// the simple map served by this site and remember that for 12 hours.
const FAIL_KEY = 'basemapFail';
const FAIL_HOURS = 12;
function recentlyFailed() {
  try { const v = Number(localStorage.getItem(FAIL_KEY)); return !!v && Date.now() - v < FAIL_HOURS * 3600e3; } catch { return false; }
}
function fallBack(cfg) {
  try { localStorage.setItem(FAIL_KEY, String(Date.now())); } catch { /* ignore */ }
  notify(t('bm.fallback', { name: cfg.name }));
  setBasemap(FALLBACK_BASEMAP, { revertTo: FALLBACK_BASEMAP, remember: false });
}
/** fn() after `ms` of the page being visible: a background tab doesn't render, so the map requests no tiles there. */
function afterVisible(ms, fn) {
  let left = ms; let started = 0; let timer = null;
  const onVis = () => {
    if (document.hidden) {
      if (timer) { clearTimeout(timer); timer = null; left -= performance.now() - started; }
    } else if (!timer) {
      started = performance.now();
      timer = setTimeout(() => { document.removeEventListener('visibilitychange', onVis); fn(); }, Math.max(0, left));
    }
  };
  document.addEventListener('visibilitychange', onVis);
  onVis();
}
function watchTiles(cfg, token) {
  if (cfg.id === FALLBACK_BASEMAP || cfg.id === 'offline') return;
  const own = new Set(Object.keys(map.getStyle().sources || {}).filter((id) => id !== SRC && id !== MIX));
  if (!own.size) return;
  let ok = false;
  const onData = (e) => { if (e.dataType === 'source' && e.tile && own.has(e.sourceId)) ok = true; };
  map.on('data', onData);
  afterVisible(10000, () => {
    map.off('data', onData);
    if (ok || token !== bmToken) return;
    fallBack(cfg);
  });
}

export function setBasemap(id, { revertTo = null, remember = true } = {}) {
  const cfg = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
  const previous = currentBasemap;
  const token = ++bmToken;
  currentBasemap = cfg.id;
  map.setStyle(typeof cfg.style === 'function' ? cfg.style() : cfg.style, { diff: false });
  // If the style can't be fetched (no internet, server down) go back to the previous one, or to the simple map.
  const timer = setTimeout(() => {
    if (token !== bmToken) return;
    if (cfg.id === FALLBACK_BASEMAP) { notify(t('bm.failed', { name: cfg.name })); return; }
    if (revertTo) { fallBack(cfg); return; }
    notify(t('bm.failed', { name: cfg.name }));
    setBasemap(previous, { revertTo: previous });
  }, 10000);
  map.once('style.load', () => {
    if (token !== bmToken) return;   // a newer switch already happened
    clearTimeout(timer);
    if (remember) { try { localStorage.setItem('basemap', cfg.id); } catch { /* ignore */ } }
    if (cfg.id !== FALLBACK_BASEMAP && remember) { try { localStorage.removeItem(FAIL_KEY); } catch { /* ignore */ } }
    watchTiles(cfg, token);
    russify(); tint(cfg); addSpotLayers(cfg); applyProjection();
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
  if (DEFAULT_BASEMAP !== 'offline' && recentlyFailed()) saved = FALLBACK_BASEMAP;   // tiles were unreachable a few hours ago
  const cfg = BASEMAPS.find((b) => b.id === saved) || BASEMAPS[0];
  currentBasemap = cfg.id;
  const token = ++bmToken;
  const box = document.getElementById('map');
  const pad0 = viewPadding();
  const startZoom = globe ? Math.min(1.9, globeFitZoom(box.clientWidth - pad0.left - pad0.right, box.clientHeight - 200)) : 1.9;
  map = new maplibregl.Map({
    container: 'map',
    style: typeof cfg.style === 'function' ? cfg.style() : cfg.style,
    center: [20, 28], zoom: startZoom, minZoom: globe ? 0.4 : FLAT_MIN_ZOOM, maxZoom: 16,
    attributionControl: false,
    renderWorldCopies: true,
    dragRotate: false, pitchWithRotate: false,
    locale: t('maplibre'),
  });
  map.touchZoomRotate.disableRotation();
  map.on('zoom', markSpace);
  map.setPadding(viewPadding());
  const attribution = new maplibregl.AttributionControl({ compact: true });
  map.addControl(attribution, 'bottom-left');
  // OSMF attribution guidelines: the credit is visible at start and may fold to the (i) button after 5 s or on the
  // first interaction with the map (it covers the corner of the month strip only for those first seconds)
  map.once('load', () => {
    const box = attribution._container || document.querySelector('.maplibregl-ctrl-attrib');
    if (!box) return;
    box.classList.add('maplibregl-compact-show');
    const fold = (e) => {
      if (e && e.target instanceof Node && box.contains(e.target)) return;   // its own (i) button toggles it
      clearTimeout(timer);
      document.removeEventListener('pointerdown', fold, true);
      map.off('wheel', fold);
      box.classList.remove('maplibregl-compact-show');
    };
    const timer = setTimeout(fold, 5000);
    document.addEventListener('pointerdown', fold, true);
    map.on('wheel', fold);
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  let loaded = false;
  map.once('style.load', () => {
    loaded = true;
    if (token === bmToken) watchTiles(cfg, token);
    russify(); tint(cfg); addSpotLayers(cfg); applyProjection();
    document.documentElement.dataset.basemap = cfg.dark ? 'dark' : 'light';
  });
  // the style itself unreachable -> the default one, and if that is the one failing, the simple map from this site
  afterVisible(10000, () => {
    if (loaded || token !== bmToken) return;
    if (cfg.id !== DEFAULT_BASEMAP && cfg.id !== FALLBACK_BASEMAP) setBasemap(DEFAULT_BASEMAP, { revertTo: DEFAULT_BASEMAP });
    else if (cfg.id !== FALLBACK_BASEMAP) fallBack(cfg);
  });
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
