// Live data fetched straight from the browser: 7-day forecast (Open-Meteo) and
// fallback photos (Wikimedia Commons) for spots that have none in the database yet.
import { t } from './i18n.js';

const cache = new Map();

export async function forecast(lat, lng) {
  const key = `f:${lat},${lng}`;
  if (cache.has(key)) return cache.get(key);
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m',
    wind_speed_unit: 'kn', timezone: 'auto', forecast_days: '7',
  });
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(t('err.forecast', { status: r.status }));
    return r.json();
  }).then((j) => summarizeDays(j.hourly));
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

function summarizeDays(hourly) {
  const days = new Map();
  hourly.time.forEach((t, i) => {
    const d = t.slice(0, 10); const hh = Number(t.slice(11, 13));
    if (hh < 9 || hh > 19) return;
    if (!days.has(d)) days.set(d, { date: d, w: [], g: [], dir: [], t: [] });
    const x = days.get(d);
    x.w.push(hourly.wind_speed_10m[i]); x.g.push(hourly.wind_gusts_10m[i]);
    x.dir.push(hourly.wind_direction_10m[i]); x.t.push(hourly.temperature_2m[i]);
  });
  return [...days.values()].map((x) => {
    const max = Math.max(...x.w); const imax = x.w.indexOf(max);
    // circular mean of directions weighted by wind speed
    let sx = 0, sy = 0;
    x.dir.forEach((d, i) => { const r = d * Math.PI / 180; sx += Math.sin(r) * x.w[i]; sy += Math.cos(r) * x.w[i]; });
    const dir = (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
    return {
      date: x.date,
      mean: x.w.reduce((a, b) => a + b, 0) / x.w.length,
      max,
      gust: Math.max(...x.g),
      dir,
      kiteHours: x.w.filter((v) => v >= 12).length,
      tmax: Math.max(...x.t),
      peakHour: 9 + imax,
    };
  });
}

// ---- photos: only shots with kites (fallback when the database has none yet) ----------------
const KITE = /kite|kitesurf|kiteboard|кайт|kiter|flysurf/i;
const BAD = /\bmap\b|karte|carte|logo|flag|coat of arms|diagram|\.svg|\.tif|\.pdf|chart|stamp/i;

export function placeNames(name) {
  const clean = name.replace(/\(.*?\)/g, ' ');
  const parts = clean.split(/[—–/,]| - /).map((x) => x.trim()).filter(Boolean);
  const out = [];
  if (parts.length > 1) out.push(`${parts[0]} ${parts[1]}`);
  if (parts.length) {
    out.push(parts[0]);
    const core = parts[0].replace(/\b(lagoon|beach|bay|kite|spot|lake|island|point|playa|praia|plage)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (core && core !== parts[0]) out.push(core);
  }
  return [...new Set(out.length ? out : [name])];
}

async function openverse(q) {
  const r = await fetch('https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, page_size: '30', mature: 'false' }));
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((x) => {
    const tags = (x.tags || []).map((t) => t.name).join(' ');
    return KITE.test(`${x.title || ''} ${tags}`) && !BAD.test(x.title || '') && (x.width || 1000) >= 640;
  }).map((x) => {
    const lic = (x.license || '').toUpperCase();
    const licText = lic && !['PDM', 'CC0'].includes(lic) ? `CC ${lic} ${x.license_version || ''}`.trim() : lic;
    return { title: x.title || '', url: x.url || x.thumbnail, thumb: x.thumbnail || x.url, page: x.foreign_landing_url,
      credit: [String(x.creator || '').slice(0, 60), licText, x.source || x.provider].filter(Boolean).join(', ') };
  }).filter((x) => x.url);
}

async function commons(q) {
  const params = {
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '1024', iiextmetadatafilter: 'Artist|LicenseShortName',
    generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '20',
  };
  for (let i = 0; i < 3; i++) {
    const j = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(params)).then((r) => r.json());
    if (!j.error) return pagesToPhotos(j).filter((p) => KITE.test(p.title));
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));  // "search too busy"
  }
  return [];
}

export async function kitePhotos(name, snow = false) {
  const key = `p:${name}:${snow}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const out = []; const seen = new Set();
    const add = (list) => list.forEach((x) => { const k = x.url.split('?')[0]; if (!seen.has(k)) { seen.add(k); out.push(x); } });
    for (const n of placeNames(name).slice(0, 3)) {
      try { add(await openverse(`${snow ? 'snowkite' : 'kitesurfing'} ${n}`)); } catch { /* Openverse unavailable */ }
      if (out.length < 4) { try { add(await commons(`${snow ? 'snowkite' : 'kitesurfing'} ${n}`)); } catch { /* Commons unavailable */ } }
      if (out.length >= 4) break;
    }
    return out.slice(0, 8);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

function pagesToPhotos(j) {
  const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  // DOMParser builds an inert document: nothing in the credit HTML can run
  const strip = (s) => new DOMParser().parseFromString(s || '', 'text/html').body.textContent.trim();
  return pages.map((p) => {
    const info = (p.imageinfo || [])[0] || {};
    const meta = info.extmetadata || {};
    return {
      title: (p.title || '').replace('File:', ''),
      url: info.thumburl, page: info.descriptionurl, mime: info.mime, width: info.width,
      credit: [strip(meta.Artist && meta.Artist.value).slice(0, 60), strip(meta.LicenseShortName && meta.LicenseShortName.value), 'Wikimedia Commons'].filter(Boolean).join(', '),
    };
  }).filter((p) => p.url && /image\/(jpeg|png|webp)/.test(p.mime || '') && (p.width || 0) >= 640 && !BAD.test(p.title));
}
