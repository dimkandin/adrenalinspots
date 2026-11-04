// Basemap options for the style switcher. All are free and need no API key.
// tint: [regex on layer id, {paint-property: value}] — applied after the style loads.

import { t } from './i18n.js';

// Fonts for the spot names come from this site (web/basemap/fonts, Noto Sans), so labels work even where
// OpenFreeMap is unreachable (Russia throttles it since 2025).
const OWN_GLYPHS = `${location.origin}/basemap/fonts/{fontstack}/{range}.pbf`;

/** Simple map served by this site itself: country outlines (Natural Earth). The automatic fallback. */
function lite() {
  return {
    version: 8,
    glyphs: OWN_GLYPHS,
    sources: { world: { type: 'geojson', data: `${location.origin}/basemap/world.geojson`, attribution: 'Natural Earth' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#c9dfe6' } },
      { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#f4f6f4' } },
      { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': '#c4d0cd', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1] } },
    ],
  };
}

function satellite() {
  return {
    version: 8,
    glyphs: OWN_GLYPHS,
    sources: {
      esri: {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: t('bm.esri_credit'),
      },
      esriLabels: {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      },
    },
    layers: [
      { id: 'sat', type: 'raster', source: 'esri' },
      { id: 'sat-labels', type: 'raster', source: 'esriLabels', paint: { 'raster-opacity': 0.9 } },
    ],
  };
}

export const BASEMAPS = [
  {
    id: 'sea',
    name: t('bm.sea'),
    hint: t('bm.sea.hint'),
    style: 'https://tiles.openfreemap.org/styles/positron',
    labelFont: ['Noto Sans Regular'],
    tint: [
      [/^water$|^water_|ocean|^lake/, { 'fill-color': '#c9dfe6' }],
      [/background/, { 'background-color': '#f4f6f4' }],
    ],
  },
  {
    id: 'liberty',
    name: t('bm.liberty'),
    hint: t('bm.liberty.hint'),
    style: 'https://tiles.openfreemap.org/styles/liberty',
    labelFont: ['Noto Sans Regular'],
  },
  {
    id: 'satellite',
    name: t('bm.satellite'),
    hint: t('bm.satellite.hint'),
    style: satellite,
    labelFont: ['Noto Sans Regular'],
    dark: true,
  },
  {
    id: 'night',
    name: t('bm.night'),
    hint: t('bm.night.hint'),
    style: 'https://tiles.openfreemap.org/styles/fiord',
    labelFont: ['Noto Sans Regular'],
    dark: true,
  },
  {
    id: 'lite',
    name: t('bm.lite'),
    hint: t('bm.lite.hint'),
    style: lite,
    labelFont: ['Noto Sans Regular'],
  },
];
export const FALLBACK_BASEMAP = 'lite';

// Developer mode: ?offline uses a local world outline (no network tiles) for testing.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('offline')) {
  BASEMAPS.unshift({
    id: 'offline', name: t('bm.offline'), hint: t('bm.offline.hint'),
    style: () => ({
      version: 8,
      sources: { world: { type: 'geojson', data: '/dev/world.geojson' } },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#c9dfe6' } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#f4f6f4', 'fill-outline-color': '#cfd8d6' } },
      ],
    }),
  });
}

export const DEFAULT_BASEMAP = BASEMAPS[0].id === 'offline' ? 'offline' : 'sea';
