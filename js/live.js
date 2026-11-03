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

/** 7-day surf forecast from the Open-Meteo marine model: daily max swell, its period and direction. */
export async function surfForecast(lat, lng) {
  const key = `s:${lat},${lng}`;
  if (cache.has(key)) return cache.get(key);
  const url = 'https://marine-api.open-meteo.com/v1/marine?' + new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4), cell_selection: 'sea', timezone: 'auto', forecast_days: '7',
    daily: 'wave_height_max,swell_wave_height_max,swell_wave_peak_period_max,swell_wave_period_max,swell_wave_direction_dominant,wave_period_max',
  });
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(t('err.forecast', { status: r.status }));
    return r.json();
  }).then((j) => {
    const d = j.daily || {};
    return (d.time || []).map((date, i) => {
      const swell = d.swell_wave_height_max ? d.swell_wave_height_max[i] : null;
      return {
        date,
        swell: swell ?? (d.wave_height_max ? d.wave_height_max[i] : null),
        wave: d.wave_height_max ? d.wave_height_max[i] : null,
        period: (d.swell_wave_peak_period_max && d.swell_wave_peak_period_max[i]) ?? (d.swell_wave_period_max && d.swell_wave_period_max[i]) ?? (d.wave_period_max ? d.wave_period_max[i] : null),
        dir: d.swell_wave_direction_dominant ? d.swell_wave_direction_dominant[i] : null,
      };
    });
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** 7-day mountain forecast (Open-Meteo): new snow and temperatures, scaled to the given elevation. */
export async function snowForecast(lat, lng, elevation) {
  const key = `n:${lat},${lng},${elevation}`;
  if (cache.has(key)) return cache.get(key);
  const params = {
    latitude: lat.toFixed(4), longitude: lng.toFixed(4), timezone: 'auto', forecast_days: '7',
    daily: 'snowfall_sum,temperature_2m_max,temperature_2m_min,sunshine_duration,wind_speed_10m_max', wind_speed_unit: 'kmh',
  };
  if (elevation) params.elevation = String(Math.round(elevation));
  const p = fetch('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(params)).then((r) => {
    if (!r.ok) throw new Error(t('err.forecast', { status: r.status }));
    return r.json();
  }).then((j) => {
    const d = j.daily || {};
    return (d.time || []).map((date, i) => ({
      date, snow: d.snowfall_sum ? d.snowfall_sum[i] : null, tmax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
      tmin: d.temperature_2m_min ? d.temperature_2m_min[i] : null, sun: d.sunshine_duration ? d.sunshine_duration[i] / 3600 : null,
      wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
    }));
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** 7-day climbing forecast (Open-Meteo): precipitation, its probability and temperatures at the crag altitude. */
export async function climbForecast(lat, lng, elevation) {
  const key = `c:${lat},${lng},${elevation}`;
  if (cache.has(key)) return cache.get(key);
  const params = {
    latitude: lat.toFixed(4), longitude: lng.toFixed(4), timezone: 'auto', forecast_days: '7',
    daily: 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,sunshine_duration,relative_humidity_2m_mean',
  };
  if (elevation) params.elevation = String(Math.round(elevation));
  const p = fetch('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(params)).then((r) => {
    if (!r.ok) throw new Error(t('err.forecast', { status: r.status }));
    return r.json();
  }).then((j) => {
    const d = j.daily || {};
    const at = (k, i) => (d[k] ? d[k][i] : null);
    return (d.time || []).map((date, i) => ({
      date, rain: at('precipitation_sum', i), prob: at('precipitation_probability_max', i), tmax: at('temperature_2m_max', i),
      tmin: at('temperature_2m_min', i), sun: at('sunshine_duration', i) != null ? at('sunshine_duration', i) / 3600 : null,
      hum: at('relative_humidity_2m_mean', i),
    }));
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** Is one daytime hour flyable at a takeoff? Same rule as the monthly statistics (backend/climate.py, knots). */
const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dirOk = (wd, dirs) => !dirs.length || wd == null || dirs.some((d) => COMPASS16.includes(d) && Math.abs(((wd - COMPASS16.indexOf(d) * 22.5 + 540) % 360) - 180) <= 50);
export function flyableHour(ws, wd, wg, rain, dirs = [], kind = 'thermal') {
  if (ws == null || (rain || 0) >= 0.3) return false;
  const g = wg ?? ws * 1.5;
  const thermal = g <= 20 && (ws <= 4.5 || (ws <= 12 && dirOk(wd, dirs)));
  const soaring = g <= 21 && ws >= 6.5 && ws <= 17 && dirOk(wd, dirs);
  return kind === 'thermal' ? thermal : kind === 'soaring' ? soaring : thermal || soaring;
}

/** 7-day paragliding forecast (Open-Meteo, knots): flyable hours 10–18, max wind and gust, wind direction, rain. */
export async function flyForecast(lat, lng, dirs = [], kind = 'thermal') {
  const key = `p:${lat},${lng},${dirs.join('')},${kind}`;
  if (cache.has(key)) return cache.get(key);
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4), timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kn',
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,temperature_2m',
  });
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(t('err.forecast', { status: r.status }));
    return r.json();
  }).then((j) => {
    const hr = j.hourly; const days = new Map();
    hr.time.forEach((ts, i) => {
      const d = ts.slice(0, 10); const hh = Number(ts.slice(11, 13));
      if (!days.has(d)) days.set(d, { date: d, fly: 0, w: [], g: [], dir: [], rain: 0, t: [] });
      const x = days.get(d);
      x.rain += hr.precipitation[i] || 0;
      if (hh < 10 || hh > 17) return;
      x.w.push(hr.wind_speed_10m[i]); x.g.push(hr.wind_gusts_10m[i]); x.dir.push(hr.wind_direction_10m[i]); x.t.push(hr.temperature_2m[i]);
      if (flyableHour(hr.wind_speed_10m[i], hr.wind_direction_10m[i], hr.wind_gusts_10m[i], hr.precipitation[i], dirs, kind)) x.fly += 1;
    });
    return [...days.values()].filter((x) => x.w.length).map((x) => {
      let sx = 0, sy = 0;
      x.dir.forEach((d, i) => { const r = d * Math.PI / 180; sx += Math.sin(r) * (x.w[i] || 0); sy += Math.cos(r) * (x.w[i] || 0); });
      return { date: x.date, fly: x.fly, max: Math.max(...x.w), gust: Math.max(...x.g), dir: (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360,
        rain: x.rain, tmax: Math.max(...x.t) };
    });
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

// ---- photos: only shots of the sport (fallback when the database has none yet) ----------------
const KITE = /kite|kitesurf|kiteboard|кайт|kiter|flysurf/i;
const SURF = /surf|surfer|surfing|сёрф|серф|wave|barrel|line-?up|longboard/i;
const SKI = /ski|snowboard|piste|slope|lift|gondola|cable car|télé|seilbahn|горнолыж|лыж|сноуборд|resort|powder/i;
const CLIMB = /climb|boulder|crag|escalad|kletter|arrampic|скалолаз|боулдер|скал|sport route|multi-?pitch|belay|\brope\b/i;
const PARA = /paraglid|parapent|parapendio|gleitschirm|parapente|paraglider|параплан|tandem flight|paragliding/i;
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

async function openverse(q, want = KITE) {
  const r = await fetch('https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, page_size: '30', mature: 'false' }));
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((x) => {
    const tags = (x.tags || []).map((t) => t.name).join(' ');
    return want.test(`${x.title || ''} ${tags}`) && !BAD.test(x.title || '') && (x.width || 1000) >= 640;
  }).map((x) => {
    const lic = (x.license || '').toUpperCase();
    const licText = lic && !['PDM', 'CC0'].includes(lic) ? `CC ${lic} ${x.license_version || ''}`.trim() : lic;
    return { title: x.title || '', url: x.url || x.thumbnail, thumb: x.thumbnail || x.url, page: x.foreign_landing_url,
      credit: [String(x.creator || '').slice(0, 60), licText, x.source || x.provider].filter(Boolean).join(', ') };
  }).filter((x) => x.url);
}

async function commons(q, want = KITE) {
  const params = {
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '1024', iiextmetadatafilter: 'Artist|LicenseShortName',
    generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '20',
  };
  for (let i = 0; i < 3; i++) {
    const j = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(params)).then((r) => r.json());
    if (!j.error) return pagesToPhotos(j).filter((p) => want.test(p.title));
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));  // "search too busy"
  }
  return [];
}

export async function kitePhotos(name, snow = false, activity = 'kite') {
  const key = `p:${name}:${snow}:${activity}`;
  if (cache.has(key)) return cache.get(key);
  const sport = { surf: 'surfing', snowboard: 'ski resort', climbing: 'climbing', paragliding: 'paragliding' }[activity] || (snow ? 'snowkite' : 'kitesurfing');
  const want = { surf: SURF, snowboard: SKI, climbing: CLIMB, paragliding: PARA }[activity] || KITE;
  const p = (async () => {
    const out = []; const seen = new Set();
    const add = (list) => list.forEach((x) => { const k = x.url.split('?')[0]; if (!seen.has(k)) { seen.add(k); out.push(x); } });
    for (const n of placeNames(name).slice(0, 3)) {
      try { add(await openverse(`${sport} ${n}`, want)); } catch { /* Openverse unavailable */ }
      if (out.length < 4) { try { add(await commons(`${sport} ${n}`, want)); } catch { /* Commons unavailable */ } }
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
