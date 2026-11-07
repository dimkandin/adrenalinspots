// Small hand-made SVG charts for the spot panel.
import { num, t } from './i18n.js';
import { MONTHS, MONTHS_SHORT, SEASON, deg, getUnit, unitLabel, wind, windText } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const BAR = { peak: '#79c99a', shoulder: '#f3d36b', snow: '#b9d3e3', off: '#dfe6e9' };

function svg(w, hgt, cls) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  s.setAttribute('class', cls || 'chart');
  s.setAttribute('role', 'img');
  return s;
}
function el(name, attrs, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

// Tooltip shared by all charts in one container.
// Touch: the first tap on a month shows its tooltip, a second tap on the same month picks it (a tap used to pick the
// month at once, the card redrew and the tooltip never showed); the tooltip stays until a tap elsewhere (browsers send
// mouseleave right after a tap). Mouse: hover shows, click picks, as before.
let touchMode = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (ev) => {
    touchMode = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    if (!touchMode) return;
    const host = ev.target instanceof Element ? ev.target.closest('.hit') && ev.target.closest('svg')?.parentElement : null;
    document.querySelectorAll('.chart-tip').forEach((t) => { if (t.parentElement !== host) t.style.display = 'none'; });
  }, true);
}
function tooltip(host) {
  let t = host.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; host.append(t); }
  if (!host.dataset.tapTips) {
    host.dataset.tapTips = '1';
    let shown = null;
    host.addEventListener('click', (ev) => {
      const hit = ev.target instanceof Element && ev.target.closest('.hit');
      if (!touchMode || !hit) return;
      const tip = host.querySelector('.chart-tip');
      if (shown === hit && tip && tip.style.display === 'block') return;   // second tap: let the chart pick the month
      ev.stopPropagation();
      hit.dispatchEvent(new MouseEvent('mousemove', { clientX: ev.clientX, clientY: ev.clientY }));
      shown = hit;
    }, true);
  }
  return {
    show(html, x, y) {
      t.innerHTML = html; t.style.display = 'block';
      const hw = host.clientWidth;
      t.style.width = ''; t.style.left = '0px'; t.style.maxWidth = `${hw - 8}px`;   // measured at the left edge: the full width is available
      const tw = t.offsetWidth;
      t.style.width = `${tw}px`;                              // keep that width wherever it ends up (no re-wrapping near the right edge)
      t.style.left = `${Math.max(4, Math.min(x - tw / 2, hw - tw - 4))}px`;
      t.style.top = `${Math.max(0, y - t.offsetHeight - 10)}px`;
    },
    hide() { if (!touchMode) t.style.display = 'none'; },
  };
}

function roundTopRect(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} Z`;
}

/** Monthly wind: columns = guide statistics coloured by season, line = ERA5 model. */
export function windChart(host, { guide, era5, seasons, month, onMonth }) {
  host.innerHTML = '';
  const W = 440, H = 190, L = 34, R = 8, T = 18, B = 26;
  const s = svg(W, H);
  const vals = guide.map((g) => (g && g.wind_kn != null ? g.wind_kn : null));
  const evals = era5 ? era5.map((e) => (e && e.wind_kn != null ? e.wind_kn : null)) : [];
  const maxKn = niceMax(Math.max(14, ...vals.filter((v) => v != null), ...evals.filter((v) => v != null)) * 1.08, 5);
  const step = (W - L - R) / 12;
  const bw = Math.min(22, step - 6);
  const y = (kn) => T + (H - T - B) * (1 - kn / maxKn);
  const unit = getUnit();

  // grid + y ticks (in the selected unit)
  const tickStep = unit === 'kn' ? 5 : 2;
  const maxU = wind(maxKn, 1);
  for (let v = 0; v <= maxU + 0.01; v += tickStep) {
    const kn = unit === 'kn' ? v : v / 0.514444;
    const yy = y(kn);
    s.append(el('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: v === 0 ? 'axis' : 'grid' }));
    s.append(el('text', { x: L - 6, y: yy + 3.5, class: 'tick', 'text-anchor': 'end' }, String(v)));
  }
  s.append(el('text', { x: 2, y: 10, class: 'tick' }, unitLabel()));
  // kiteable threshold
  const ty = y(12);
  s.append(el('line', { x1: L, x2: W - R, y1: ty, y2: ty, class: 'threshold' }));

  for (let i = 0; i < 12; i++) {
    const cx = L + step * i + step / 2;
    const v = vals[i];
    const season = seasons[i] || 'off';
    if (v != null) {
      const top = y(v);
      const p = el('path', { d: roundTopRect(cx - bw / 2, top, bw, y(0) - top, 4), fill: BAR[season], class: `bar ${i + 1 === month ? 'is-current' : ''}` });
      s.append(p);
      if (i + 1 === month) {
        s.append(el('text', { x: cx, y: top - 5, class: 'value', 'text-anchor': 'middle' }, num(wind(v))));
      }
    }
    s.append(el('text', { x: cx, y: H - 8, class: `tick month ${i + 1 === month ? 'is-current' : ''}`, 'text-anchor': 'middle' }, MONTHS_SHORT[i]));
  }
  // ERA5 line
  if (evals.some((v) => v != null)) {
    let d = '';
    evals.forEach((v, i) => {
      if (v == null) return;
      const cx = L + step * i + step / 2;
      d += `${d ? 'L' : 'M'}${cx},${y(v)}`;
    });
    s.append(el('path', { d, class: 'line era5' }));
    evals.forEach((v, i) => {
      if (v == null) return;
      s.append(el('circle', { cx: L + step * i + step / 2, cy: y(v), r: 3.2, class: 'dot era5' }));
    });
  }
  // hit areas
  const tip = tooltip(host);
  for (let i = 0; i < 12; i++) {
    const x0 = L + step * i;
    const hit = el('rect', { x: x0, y: T - 10, width: step, height: H - T - B + 10, class: 'hit' });
    hit.addEventListener('mousemove', (ev) => {
      const g = guide[i] || {}; const e = era5 && era5[i] ? era5[i] : null;
      const season = SEASON[seasons[i] || 'off'];
      const rect = host.getBoundingClientRect();
      tip.show(`<b>${MONTHS[i]}</b> — ${season.short}<br>
        ${t('chart.mean', { v: windText(g.wind_kn) })}${g.wind_prob != null ? `<br>${t('chart.prob', { p: Math.round(g.wind_prob) })}` : ''}
        ${e ? `<br><span class="muted">${t('chart.era5', { w: windText(e.wind_kn), g: windText(e.gust_kn), p: Math.round(e.wind_prob) })}</span>` : ''}`,
      ev.clientX - rect.left, ev.clientY - rect.top);
    });
    hit.addEventListener('mouseleave', () => tip.hide());
    hit.addEventListener('click', () => onMonth && onMonth(i + 1));
    s.append(hit);
  }
  s.setAttribute('aria-label', t('chart.wind_aria', { unit: unitLabel() }));
  host.append(s);
}

/** Air & water temperature lines on one °C axis. */
export function tempChart(host, { guide, era5, month, night = false }) {
  host.innerHTML = '';
  // the model wins for mountain temperatures (scaled to mid-mountain); elsewhere guide numbers come first
  const pick = (k) => guide.map((g, i) => {
    const e = era5 && era5[i] && era5[i][k] != null ? era5[i][k] : null;
    const gv = g && g[k] != null ? g[k] : null;
    return night ? (e ?? gv) : (gv ?? e);
  });
  const air = pick('air_c');
  const water = pick(night ? 'tmin_c' : 'water_c');
  const all = [...air, ...water].filter((v) => v != null);
  if (!all.length) { host.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: t('chart.no_temp') })); return; }
  const W = 440, H = 150, L = 34, R = 8, T = 12, B = 24;
  const lo = Math.floor((Math.min(...all) - 2) / 5) * 5;
  const hi = Math.ceil((Math.max(...all) + 2) / 5) * 5;
  const s = svg(W, H);
  const step = (W - L - R) / 12;
  const x = (i) => L + step * i + step / 2;
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  for (let v = lo; v <= hi; v += 5) {
    s.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === lo ? 'axis' : 'grid' }));
    s.append(el('text', { x: L - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, `${v}°`));
  }
  for (let i = 0; i < 12; i++) {
    s.append(el('text', { x: x(i), y: H - 7, class: `tick month ${i + 1 === month ? 'is-current' : ''}`, 'text-anchor': 'middle' }, MONTHS_SHORT[i]));
  }
  s.append(el('line', { x1: x(month - 1), x2: x(month - 1), y1: T, y2: H - B, class: 'cursor' }));
  const series = [
    { vals: air, cls: 'air', label: t('chart.air') },
    { vals: water, cls: 'water', label: night ? t('chart.night') : t('chart.water') },
  ];
  for (const sr of series) {
    let d = '';
    sr.vals.forEach((v, i) => { if (v != null) d += `${d ? 'L' : 'M'}${x(i)},${y(v)}`; });
    if (!d) continue;
    s.append(el('path', { d, class: `line ${sr.cls}` }));
    const cur = sr.vals[month - 1];
    if (cur != null) s.append(el('circle', { cx: x(month - 1), cy: y(cur), r: 4, class: `dot ${sr.cls}` }));
  }
  const tip = tooltip(host);
  for (let i = 0; i < 12; i++) {
    const hit = el('rect', { x: L + step * i, y: T, width: step, height: H - T - B, class: 'hit' });
    hit.addEventListener('mousemove', (ev) => {
      const rect = host.getBoundingClientRect();
      tip.show(`<b>${MONTHS[i]}</b><br>${t('chart.air_day')}: ${deg(air[i])}<br>${night ? t('chart.night_cap') : t('chart.water_cap')}: ${deg(water[i])}`, ev.clientX - rect.left, ev.clientY - rect.top);
    });
    hit.addEventListener('mouseleave', () => tip.hide());
    s.append(hit);
  }
  s.setAttribute('aria-label', t('chart.temp_aria'));
  host.append(s);
}

/** 16-sector wind rose for one month (ERA5): petal length = share of kiteable daytime hours. */
export function windRose(host, rose) {
  host.innerHTML = '';
  const S = 200, C = S / 2, Rmax = 82;
  const s = svg(S, S, 'chart rose');
  const total = rose.reduce((a, b) => a + b, 0);
  const max = Math.max(...rose, 0.0001);
  for (const f of [0.33, 0.66, 1]) s.append(el('circle', { cx: C, cy: C, r: Rmax * f, class: 'grid' }));
  const names = t('compass');
  names.forEach((n, i) => {
    const a = (i * 90 - 90) * Math.PI / 180;
    s.append(el('text', { x: C + Math.cos(a) * (Rmax + 11), y: C + Math.sin(a) * (Rmax + 11) + 4, class: 'tick', 'text-anchor': 'middle' }, n));
  });
  rose.forEach((v, i) => {
    if (!v) return;
    const r = Rmax * Math.sqrt(v / max);
    const a0 = ((i * 22.5) - 10 - 90) * Math.PI / 180;
    const a1 = ((i * 22.5) + 10 - 90) * Math.PI / 180;
    const d = `M${C},${C} L${C + Math.cos(a0) * r},${C + Math.sin(a0) * r} A${r},${r} 0 0 1 ${C + Math.cos(a1) * r},${C + Math.sin(a1) * r} Z`;
    s.append(el('path', { d, class: 'petal' }, null));
  });
  s.append(el('circle', { cx: C, cy: C, r: 2.5, class: 'center' }));
  s.setAttribute('aria-label', t('chart.rose_aria', { p: Math.round(total * 100) }));
  host.append(s);
  return Math.round(total * 100);
}

/** Monthly swell (surf): columns = wave-model swell height coloured by season, dashed line = rideable size,
 *  dots = the research estimate when both exist. */
export function swellChart(host, { guide, era5, seasons, month, onMonth }) {
  host.innerHTML = '';
  const W = 440, H = 190, L = 34, R = 8, T = 18, B = 26;
  const s = svg(W, H);
  const model = (era5 || []).map((e) => (e && e.swell_m != null ? e.swell_m : null));
  const est = guide.map((g) => (g && g.wave_m != null ? g.wave_m : null));
  const hasModel = model.some((v) => v != null);
  const bars = hasModel ? model : est;
  const dots = hasModel ? est : [];
  const all = [...bars, ...dots].filter((v) => v != null);
  if (!all.length) { host.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: t('chart.no_swell') })); return; }
  const maxM = niceMax(Math.max(1.5, ...all) * 1.1, 0.5);
  const step = (W - L - R) / 12;
  const bw = Math.min(22, step - 6);
  const y = (m) => T + (H - T - B) * (1 - m / maxM);
  const tickStep = maxM > 4 ? 1 : 0.5;
  for (let v = 0; v <= maxM + 0.001; v += tickStep) {
    s.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
    s.append(el('text', { x: L - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, num(v)));
  }
  s.append(el('text', { x: 2, y: 10, class: 'tick' }, t('unit.m')));
  s.append(el('line', { x1: L, x2: W - R, y1: y(0.6), y2: y(0.6), class: 'threshold' }));
  for (let i = 0; i < 12; i++) {
    const cx = L + step * i + step / 2;
    const v = bars[i];
    const season = seasons[i] || 'off';
    if (v != null) {
      const top = y(v);
      s.append(el('path', { d: roundTopRect(cx - bw / 2, top, bw, y(0) - top, 4), fill: BAR[season], class: `bar ${i + 1 === month ? 'is-current' : ''}` }));
      if (i + 1 === month) s.append(el('text', { x: cx, y: top - 5, class: 'value', 'text-anchor': 'middle' }, num(v, 1)));
    }
    s.append(el('text', { x: cx, y: H - 8, class: `tick month ${i + 1 === month ? 'is-current' : ''}`, 'text-anchor': 'middle' }, MONTHS_SHORT[i]));
  }
  if (dots.some((v) => v != null)) {
    dots.forEach((v, i) => {
      if (v == null) return;
      s.append(el('circle', { cx: L + step * i + step / 2, cy: y(v), r: 3.2, class: 'dot era5' }));
    });
  }
  const tip = tooltip(host);
  for (let i = 0; i < 12; i++) {
    const hit = el('rect', { x: L + step * i, y: T - 10, width: step, height: H - T - B + 10, class: 'hit' });
    hit.addEventListener('mousemove', (ev) => {
      const e = era5 && era5[i] ? era5[i] : {};
      const g = guide[i] || {};
      const season = SEASON[seasons[i] || 'off'];
      const rect = host.getBoundingClientRect();
      const rows = [
        bars[i] != null ? t('chart.swell', { m: num(bars[i], 1) }) : null,
        e.swell_s != null ? t('chart.period', { s: Math.round(e.swell_s) }) : null,
        e.surf_prob != null ? t('chart.surf_days', { p: Math.round(e.surf_prob) }) : null,
        hasModel && g.wave_m != null ? `<span class="muted">${t('chart.swell_guide', { m: num(g.wave_m, 1) })}</span>` : null,
      ].filter(Boolean);
      tip.show(`<b>${MONTHS[i]}</b> — ${season.short}<br>${rows.join('<br>')}`, ev.clientX - rect.left, ev.clientY - rect.top);
    });
    hit.addEventListener('mouseleave', () => tip.hide());
    hit.addEventListener('click', () => onMonth && onMonth(i + 1));
    s.append(hit);
  }
  s.setAttribute('aria-label', t('chart.swell_aria'));
  host.append(s);
}

/** Monthly snow (mountains): columns = snow depth from the snow model coloured by season,
 *  dashed line = 30 cm of natural snow, dots = the research estimate when both exist. */
export function snowChart(host, { guide, era5, seasons, month, onMonth }) {
  host.innerHTML = '';
  const W = 440, H = 190, L = 38, R = 8, T = 18, B = 26;
  const s = svg(W, H);
  const model = (era5 || []).map((e) => (e && e.snow_cm != null ? e.snow_cm : null));
  const est = guide.map((g) => (g && g.snow_cm != null ? g.snow_cm : null));
  const hasModel = model.some((v) => v != null && v > 0);
  const bars = hasModel ? model : est;
  const dots = hasModel ? est : [];
  const all = [...bars, ...dots].filter((v) => v != null);
  if (!all.length) { host.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: t('chart.no_snow') })); return; }
  const maxV = niceMax(Math.max(60, ...all) * 1.1, 50);
  const step = (W - L - R) / 12;
  const bw = Math.min(22, step - 6);
  const y = (v) => T + (H - T - B) * (1 - v / maxV);
  const tickStep = maxV > 300 ? 100 : 50;
  for (let v = 0; v <= maxV + 0.001; v += tickStep) {
    s.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
    s.append(el('text', { x: L - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, num(v)));
  }
  s.append(el('text', { x: 2, y: 10, class: 'tick' }, t('unit.cm')));
  s.append(el('line', { x1: L, x2: W - R, y1: y(30), y2: y(30), class: 'threshold' }));
  for (let i = 0; i < 12; i++) {
    const cx = L + step * i + step / 2;
    const v = bars[i];
    const season = seasons[i] || 'off';
    if (v != null && v > 0) {
      const top = y(v);
      s.append(el('path', { d: roundTopRect(cx - bw / 2, top, bw, y(0) - top, 4), fill: BAR[season], class: `bar ${i + 1 === month ? 'is-current' : ''}` }));
    }
    if (i + 1 === month && v != null) s.append(el('text', { x: cx, y: y(Math.max(v, 0)) - 5, class: 'value', 'text-anchor': 'middle' }, num(Math.round(v))));
    s.append(el('text', { x: cx, y: H - 8, class: `tick month ${i + 1 === month ? 'is-current' : ''}`, 'text-anchor': 'middle' }, MONTHS_SHORT[i]));
  }
  dots.forEach((v, i) => {
    if (v == null) return;
    s.append(el('circle', { cx: L + step * i + step / 2, cy: y(v), r: 3.2, class: 'dot era5' }));
  });
  const tip = tooltip(host);
  for (let i = 0; i < 12; i++) {
    const hit = el('rect', { x: L + step * i, y: T - 10, width: step, height: H - T - B + 10, class: 'hit' });
    hit.addEventListener('mousemove', (ev) => {
      const e = era5 && era5[i] ? era5[i] : {};
      const g = guide[i] || {};
      const season = SEASON[seasons[i] || 'off'];
      const rect = host.getBoundingClientRect();
      const rows = [
        bars[i] != null ? t('chart.snow', { v: num(Math.round(bars[i])) }) : null,
        e.snowfall_cm != null ? t('chart.snowfall', { v: num(Math.round(e.snowfall_cm)) }) : null,
        e.snow_days != null ? t('chart.snow_days', { n: num(Math.round(e.snow_days)) }) : null,
        hasModel && g.snow_cm != null ? `<span class="muted">${t('chart.snow_guide', { v: num(Math.round(g.snow_cm)) })}</span>` : null,
      ].filter(Boolean);
      tip.show(`<b>${MONTHS[i]}</b> — ${season.short}<br>${rows.join('<br>')}`, ev.clientX - rect.left, ev.clientY - rect.top);
    });
    hit.addEventListener('mouseleave', () => tip.hide());
    hit.addEventListener('click', () => onMonth && onMonth(i + 1));
    s.append(hit);
  }
  s.setAttribute('aria-label', t('chart.snow_aria'));
  host.append(s);
}

/** Monthly climbing weather: columns = share of dry days (weather model) coloured by season. */
export function dryChart(host, { era5, seasons, month, onMonth }) {
  pctChart(host, { era5, seasons, month, onMonth, key: 'dry_prob', aria: t('chart.dry_aria'), empty: t('chart.no_dry'),
    rows: (e) => [
      e.dry_prob != null ? t('chart.dry', { p: Math.round(e.dry_prob) }) : null,
      e.rain_days != null ? t('chart.rain_days', { n: num(Math.round(e.rain_days)) }) : null,
      e.air_c != null ? t('chart.day_night', { d: deg(e.air_c), n: deg(e.tmin_c) }) : null,
      e.hum_pct != null ? t('chart.humidity', { p: Math.round(e.hum_pct) }) : null,
    ] });
}

/** Columns of a monthly percentage from the weather model (dry days, flyable days…), coloured by season. */
export function pctChart(host, { era5, seasons, month, onMonth, key, rows, aria, empty }) {
  host.innerHTML = '';
  const vals = (era5 || []).map((e) => (e && e[key] != null ? e[key] : null));
  if (!vals.some((v) => v != null)) { host.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: empty })); return; }
  const W = 440, H = 170, L = 38, R = 8, T = 18, B = 26;
  const s = svg(W, H);
  const step = (W - L - R) / 12;
  const bw = Math.min(22, step - 6);
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  for (let v = 0; v <= 100; v += 25) {
    s.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
    s.append(el('text', { x: L - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, `${v}%`));
  }
  for (let i = 0; i < 12; i++) {
    const cx = L + step * i + step / 2;
    const v = vals[i];
    const season = seasons[i] || 'off';
    if (v != null && v > 0) {
      const top = y(v);
      s.append(el('path', { d: roundTopRect(cx - bw / 2, top, bw, y(0) - top, 4), fill: BAR[season], class: `bar ${i + 1 === month ? 'is-current' : ''}` }));
    }
    if (i + 1 === month && v != null) s.append(el('text', { x: cx, y: y(v) - 5, class: 'value', 'text-anchor': 'middle' }, `${Math.round(v)}%`));
    s.append(el('text', { x: cx, y: H - 8, class: `tick month ${i + 1 === month ? 'is-current' : ''}`, 'text-anchor': 'middle' }, MONTHS_SHORT[i]));
  }
  const tip = tooltip(host);
  for (let i = 0; i < 12; i++) {
    const hit = el('rect', { x: L + step * i, y: T - 10, width: step, height: H - T - B + 10, class: 'hit' });
    hit.addEventListener('mousemove', (ev) => {
      const e = era5 && era5[i] ? era5[i] : {};
      const season = SEASON[seasons[i] || 'off'];
      const rect = host.getBoundingClientRect();
      tip.show(`<b>${MONTHS[i]}</b> — ${season.short}<br>${rows(e).filter(Boolean).join('<br>')}`, ev.clientX - rect.left, ev.clientY - rect.top);
    });
    hit.addEventListener('mouseleave', () => tip.hide());
    hit.addEventListener('click', () => onMonth && onMonth(i + 1));
    s.append(hit);
  }
  s.setAttribute('aria-label', aria);
  host.append(s);
}
