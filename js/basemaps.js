// Basemap options for the style switcher. All are free and need no API key.
// tint: [regex on layer id, {paint-property: value}] — applied after the style loads.

import { t } from './i18n.js';

const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

function satellite() {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
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
];

// Developer mode: ?offline uses a local world outline (no network tiles) for testing.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('offline')) {
  BASEMAPS.unshift({
    id: 'offline', name: t('bm.offline'), hint: t('bm.offline.hint'),
    style: () => ({
      version: 8,
      sources: { world: { type: 'geojson', data: 'dev/world.geojson' } },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#c9dfe6' } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#f4f6f4', 'fill-outline-color': '#cfd8d6' } },
      ],
    }),
  });
}

export const DEFAULT_BASEMAP = BASEMAPS[0].id === 'offline' ? 'offline' : 'sea';
