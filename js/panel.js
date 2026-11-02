// Spot detail panel.
import { tempChart, windChart, windRose } from './charts.js';
import { forecast, kitePhotos, placeNames } from './live.js';
import { isRu, num, t, tn, weekdayShort } from './i18n.js';
import {
  LEVEL, MONTHS, MONTHS_IN, SCHOOLS, SEASON, SPOT_TYPE, VISA, WATER, WIND_TYPE,
  deg, esc, flagEmoji, getUnit, h, rating, vibeLabel, windRangeText, windText, youtubeId,
} from './util.js';

const panel = () => document.querySelector('.panel');
let current = null;   // spot detail currently shown
let prevId = null;    // id of the spot rendered last (to detect re-renders)
let ctx = null;       // { month, setMonth }

function meter(value, max = 5, label = '') {
  const wrap = h('span', { class: 'meter', role: 'meter', 'aria-valuemin': 1, 'aria-valuemax': max, 'aria-valuenow': value ?? 0, 'aria-label': label });
  for (let i = 1; i <= max; i++) wrap.append(h('i', { class: value != null && i <= value ? 'on' : '' }));
  return wrap;
}

function visaChip(v, long = false) {
  if (!v) return h('span', { class: 'chip tone-neutral' }, t('visa.none'));
  const meta = VISA[v.status] || VISA.visa_easy;
  const text = long && v.label ? v.label : meta.label;
  return h('span', { class: `chip tone-${meta.tone}` }, h('b', { 'aria-hidden': 'true' }, meta.icon), ' ', text);
}

function seasonChip(season, month) {
  const s = SEASON[season] || SEASON.off;
  return h('span', { class: `chip season-chip season-${season}` }, h('i', { class: 'sw' }), `${s.label} ${MONTHS_IN[month - 1]}`);
}

function section(title, ...body) {
  return h('section', { class: 'p-sec' }, h('h3', {}, title), ...body);
}

function fact(label, ...value) {
  return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, ...value));
}

function gustText(g) {
  return g >= 1 && g <= 5 ? t(`gust.${g}`) : '—';
}

function renderPhotos(host, spot) {
  host.innerHTML = '';
  const show = (photos) => {
    host.innerHTML = '';
    if (!photos.length) {
      host.append(h('div', { class: 'gallery-empty' }, h('span', {}, t('card.photos_none')),
        h('a', { href: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent('kitesurfing ' + placeNames(spot.name)[0])}`, target: '_blank', rel: 'noopener' }, t('card.photos_google'))));
      return;
    }
    const strip = h('div', { class: 'gallery', tabindex: '0', 'aria-label': t('card.photos_aria') });
    photos.forEach((p, i) => {
      strip.append(h('figure', {},
        h('button', { type: 'button', class: 'photo-btn', 'aria-label': t('card.photo_open', { i: i + 1, n: photos.length }), onclick: () => lightbox(photos, i) },
          h('img', { src: p.thumb || p.url, alt: p.title || spot.name_ru, loading: i < 2 ? 'eager' : 'lazy',
            onerror: (e) => {
              const f = e.target.closest('figure'); if (f) f.remove();
              if (!strip.querySelector('figure')) show([]);   // every photo failed -> show the fallback
            } })),
        h('figcaption', {}, p.page ? h('a', { href: p.page, target: '_blank', rel: 'noopener' }, p.credit || t('card.source')) : (p.credit || ''))));
    });
    host.append(strip);
  };
  const stored = spot.photos || [];
  const snow = (spot.water || []).some((w) => w === 'snow' || w === 'ice') && !(spot.water || []).includes('flat');
  if (stored.length >= 4) { show(stored); return; }
  // Few or no photos in the database yet: look them up from the browser and merge.
  if (stored.length) show(stored); else host.append(h('div', { class: 'gallery-empty' }, t('card.photos_searching')));
  kitePhotos(spot.name, snow).then((ph) => {
    if (!current || current.id !== spot.id) return;
    const seen = new Set(stored.map((x) => x.url.split('?')[0]));
    show(stored.concat(ph.filter((x) => !seen.has(x.url.split('?')[0]))).slice(0, 8));
  }).catch(() => { if (current && current.id === spot.id) show(stored); });
}

function vibeBlock(spot) {
  const v = spot.vibe;
  if (!v) {
    return h('p', { class: 'muted' }, t('card.vibe_missing'));
  }
  const list = (c) => ['bars', 'clubs', 'restaurants', 'cafes', 'hotels'].map((k) => tn(`n.${k}`, c[k] || 0)).join(', ');
  const wrap = h('div', { class: 'vibe' },
    h('div', { class: 'vibe-head' }, meter(v.score, 5, t('card.vibe')), h('b', {}, t('card.vibe_score', { s: v.score, label: vibeLabel(v.score) }))));
  if (v.manual && v.note) wrap.append(h('p', { class: 'vibe-note' }, v.note));
  if (v.bars != null) {
    wrap.append(h('p', { class: 'vibe-counts' }, t('card.vibe_near', { km: v.radius_km, list: list(v) })));
    if (v.ring) wrap.append(h('p', { class: 'vibe-counts' }, t('card.vibe_ring', { km: v.ring.km, list: list(v.ring) })));
  }
  if ((spot.vibe_photos || []).length) {
    wrap.append(h('div', { class: 'vibe-photos' }, ...spot.vibe_photos.map((p, i) => h('figure', {},
      h('button', { type: 'button', class: 'photo-btn', 'aria-label': t('card.photo_open1', { i: i + 1 }), onclick: () => lightbox(spot.vibe_photos, i) },
        h('img', { src: p.url, alt: p.title || '', loading: 'lazy',
          onerror: (e) => { const f = e.target.closest('figure'); if (f) f.remove(); } }))))));
  }
  wrap.append(h('p', { class: 'source' }, v.manual && v.auto_score
    ? t('card.vibe_manual', { auto: v.auto_score })
    : t('card.vibe_source')));
  return wrap;
}

function lightbox(photos, start) {
  let i = start;
  const img = h('img', { alt: '' });
  const cap = h('p', {});
  const returnTo = document.activeElement;
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('card.photo'), tabindex: '-1' },
    img, cap,
    h('button', { class: 'lb-prev', 'aria-label': t('card.photo_prev'), onclick: (e) => { e.stopPropagation(); go(-1); } }, '‹'),
    h('button', { class: 'lb-next', 'aria-label': t('card.photo_next'), onclick: (e) => { e.stopPropagation(); go(1); } }, '›'),
    h('button', { class: 'lb-close', 'aria-label': t('card.close'), onclick: () => close() }, '×'));
  const go = (d) => { i = (i + d + photos.length) % photos.length; img.src = photos[i].url; cap.textContent = photos[i].credit || ''; };
  const key = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Tab') {               // keep focus inside the dialog
      const items = [...box.querySelectorAll('button')];
      const i2 = items.indexOf(document.activeElement);
      const next = items[(i2 + (e.shiftKey ? -1 : 1) + items.length) % items.length];
      next.focus(); e.preventDefault();
    }
    e.stopPropagation();
  };
  const close = () => { box.remove(); document.removeEventListener('keydown', key, true); if (returnTo && returnTo.focus) returnTo.focus(); };
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', key, true);
  go(0);
  document.body.append(box);
  box.querySelector('.lb-close').focus();
}

function renderVideos(spot) {
  const list = h('div', { class: 'videos' });
  for (const v of spot.videos || []) {
    const id = youtubeId(v.url);
    if (!id) {
      list.append(h('a', { class: 'video-link', href: v.url, target: '_blank', rel: 'noopener' }, v.title || v.url));
      continue;
    }
    const card = h('button', { class: 'video', type: 'button', 'aria-label': t('card.video_watch', { title: v.title || t('card.video') }) },
      h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy' }),
      h('span', { class: 'v-play', 'aria-hidden': 'true' }, '▶'),
      h('span', { class: 'v-title' }, v.title || t('card.video')));
    card.addEventListener('click', () => {
      card.replaceWith(h('div', { class: 'video-frame' }, h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`, title: v.title || t('card.video'),
        allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy',
      })));
    });
    list.append(card);
  }
  list.append(h('a', { class: 'more-link', href: `https://www.youtube.com/results?search_query=${encodeURIComponent('kitesurfing ' + spot.name)}`, target: '_blank', rel: 'noopener' },
    (spot.videos || []).length ? t('card.video_more') : t('card.video_find')));
  return list;
}

function renderForecast(host, spot) {
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  forecast(spot.lat, spot.lng).then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const max = Math.max(30, ...days.map((d) => d.gust));
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      const good = d.kiteHours >= 3;
      rows.append(h('div', { class: `fc-row ${good ? 'is-good' : ''}`, title: t('card.fc_row', { h: d.kiteHours, v: windText(12), peak: d.peakHour }) },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        h('span', { class: 'fc-dir', style: `transform: rotate(${Math.round(d.dir + 180)}deg)`, 'aria-label': t('card.fc_dir', { d: Math.round(d.dir) }) }, '↑'),
        h('span', { class: 'fc-bar' },
          h('i', { class: 'fc-w', style: `width:${(d.max / max) * 100}%` }),
          h('i', { class: 'fc-g', style: `left:${(d.gust / max) * 100}%` })),
        h('span', { class: 'fc-val' }, windText(d.max), h('small', {}, ` ${t('card.fc_gusts', { v: windText(d.gust) })}`))));
    }
    host.append(rows, h('p', { class: 'source' }, t('card.fc_source', { v: windText(12) })));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

function climateBlock(spot, month) {
  const guide = spot.climate.guide.map((g) => g || {});
  const local = !!spot.era5_local_wind;           // the model can't see this spot's wind
  const era5 = local ? null : spot.climate.era5;
  const wrap = h('div', {});
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('i', { class: 'lg-bar' }), t('card.lg_mean')),
    era5 ? h('span', {}, h('i', { class: 'lg-line' }), t('card.lg_era5')) : null,
    h('span', {}, h('i', { class: 'lg-threshold' }), t('card.lg_threshold', { v: windText(12) })));
  const chartHost = h('div', { class: 'chart-host' });
  wrap.append(legend, chartHost);
  windChart(chartHost, { guide, era5, seasons: spot.seasons, month, onMonth: ctx.setMonth });
  const sel = guide[month - 1] || {};
  const e = era5 ? era5[month - 1] : null;
  const stats = h('dl', { class: 'facts facts-3' },
    fact(t('card.wind_in', { in_month: MONTHS_IN[month - 1] }), windText(sel.wind_kn)),
    fact(t('card.wind_days'), sel.wind_prob != null ? `${Math.round(sel.wind_prob)}%` : (e ? `${Math.round(e.wind_prob)}%` : '—')),
    fact(t('card.gusts_model'), e && e.gust_kn != null ? windText(e.gust_kn) : '—'));
  wrap.append(stats);
  const modelNote = local
    ? t('card.era5_local')
    : era5 ? t('card.era5_line', { period: spot.climate_periods.era5 })
      : t('card.era5_pending');
  wrap.append(h('p', { class: 'source' }, `${t('card.bars_source')}${modelNote}`));
  return wrap;
}

export function renderPanel(spot, context) {
  current = spot; ctx = context;
  const month = ctx.month;
  const p = panel();
  const body = p.querySelector('.panel-body');
  // Re-rendering the same spot (month or units changed): keep the scroll position and the
  // already-loaded photos and forecast instead of jumping to the top and refetching.
  const same = prevId === spot.id && p.classList.contains('is-open');
  const keepScroll = same ? body.scrollTop : 0;
  const oldGallery = same ? body.querySelector('.gallery-host') : null;
  const oldForecast = same ? body.querySelector(`.fc-host[data-unit="${getUnit()}"]`) : null;
  const oldVideos = same ? body.querySelector('.videos') : null;
  prevId = spot.id;
  body.innerHTML = '';

  const gallery = oldGallery || h('div', { class: 'gallery-host' });
  const season = spot.seasons[month - 1];
  const header = h('header', { class: 'p-head' },
    h('p', { class: 'p-place' }, `${flagEmoji(spot.cc)} ${spot.country || ''}${spot.region ? `, ${spot.region}` : ''}`),
    h('h2', { id: 'panel-title', tabindex: '-1' }, spot.name_ru),
    spot.name !== spot.name_ru ? h('p', { class: 'p-latin' }, spot.name) : null,
    h('div', { class: 'p-scores' },
      h('div', { class: 'p-score' },
        h('span', { class: 'p-score-label' }, t('card.rating'), h('span', { class: 'visually-hidden' }, ':')),
        h('span', { class: 'stars', 'aria-label': t('card.rating_aria', { r: rating(spot.rating) }) }, h('b', {}, rating(spot.rating)), t('card.of5'))),
      h('div', { class: 'p-score', title: spot.vibe ? t('card.vibe_title') : t('card.vibe_pending') },
        h('span', { class: 'p-score-label' }, t('card.vibe'), h('span', { class: 'visually-hidden' }, ':')),
        spot.vibe ? h('span', { class: 'stars' }, h('b', {}, String(spot.vibe.score)), t('card.vibe_short', { label: vibeLabel(spot.vibe.score) })) : h('span', { class: 'muted' }, t('card.vibe_none')))),
    spot.rating_basis ? h('p', { class: 'p-basis muted' }, spot.rating_basis) : null,
    h('div', { class: 'chips' }, seasonChip(season, month), isRu ? visaChip(spot.visa) : null,
      isRu && spot.ru_schools === 'yes' ? h('span', { class: 'chip tone-easy' }, t('card.ru_schools_chip')) : null));

  const water = (spot.water || []).map((w) => h('span', { class: `tag water-${w}` }, WATER[w] || w));
  const era = spot.climate.era5 ? spot.climate.era5[month - 1] : null;
  const facts = h('dl', { class: 'facts' },
    fact(t('card.wind_range'), windRangeText(spot.wind_range) || '—'),
    fact(t('card.direction'), spot.wind_dir || '—', spot.wind_type ? h('small', {}, ` ${WIND_TYPE[spot.wind_type] || spot.wind_type}`) : null),
    fact(t('card.gustiness'), meter(spot.gustiness, 5, t('card.gustiness')), h('small', {}, ` ${gustText(spot.gustiness)}`), spot.gustiness_note ? h('small', { class: 'block' }, spot.gustiness_note) : null),
    fact(t('card.water'), h('span', { class: 'tags' }, ...water)),
    fact(t('card.waves'), spot.waves_note || '—', era && era.wave_m != null ? h('small', { class: 'block' }, t('card.waves_avg', { m: num(era.wave_m, 1), in_month: MONTHS_IN[month - 1] })) : null),
    fact(t('card.depth'), spot.depth ? t(`depth.${spot.depth}`) : '—'),
    fact(t('card.spot_type'), SPOT_TYPE[spot.spot_type] || spot.spot_type || '—'),
    fact(t('card.level'), (spot.level || []).map((l) => LEVEL[l]).join(', ') || '—'),
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd'), meter(spot.crowd, 5, t('card.crowd_meter')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null));

  body.append(gallery, header);
  if (spot.description) body.append(h('p', { class: 'p-desc' }, spot.description));
  body.append(section(t('sec.conditions'), facts));
  body.append(section(t('sec.vibe'), vibeBlock(spot)));
  body.append(section(t('sec.wind'), climateBlock(spot, month)));

  const tempHost = h('div', { class: 'chart-host' });
  const g = spot.climate.guide[month - 1] || {};
  const hasWater = spot.climate.guide.some((x) => x && x.water_c != null)
    || (spot.climate.era5 || []).some((x) => x && x.water_c != null);
  body.append(section(t('sec.temp'),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'lg-line air' }), t('chart.air_day')),
      hasWater ? h('span', {}, h('i', { class: 'lg-line water' }), t('chart.water_cap')) : null),
    tempHost,
    h('dl', { class: `facts ${hasWater ? 'facts-2' : 'facts-1'}` },
      fact(t('card.air_in', { in_month: MONTHS_IN[month - 1] }), deg(g.air_c ?? (era && era.air_c))),
      hasWater ? fact(t('card.water'), deg(g.water_c ?? (era && era.water_c))) : null)));
  tempChart(tempHost, { guide: spot.climate.guide, era5: spot.climate.era5, month });

  if (!spot.era5_local_wind && era && era.rose && era.rose.some((x) => x > 0)) {
    const roseHost = h('div', { class: 'rose-host' });
    const sec = section(t('sec.rose', { in_month: MONTHS_IN[month - 1] }), roseHost);
    body.append(sec);
    const share = windRose(roseHost, era.rose);
    roseHost.append(h('p', { class: 'source' }, t('card.rose_note', { v: windText(12), p: share, period: spot.climate_periods.era5 })));
  }

  const fcHost = oldForecast || h('div', { class: 'fc-host', 'data-unit': getUnit() });
  body.append(section(t('sec.forecast'), fcHost));
  if (!oldForecast) renderForecast(fcHost, spot);

  body.append(section(t('sec.video'), oldVideos || renderVideos(spot)));  // keep a playing video alive

  const schools = h('div', {},
    h('p', {}, SCHOOLS[spot.schools] || t('card.schools_unknown'),
      !isRu ? '.' : spot.ru_schools === 'yes' ? t('card.schools_ru_yes') : spot.ru_schools === 'no' ? t('card.schools_ru_no') : '.'));
  if (spot.school_list.length) {
    schools.append(h('ul', { class: 'schools' }, ...spot.school_list.map((sc) => h('li', {},
      sc.url ? h('a', { href: sc.url, target: '_blank', rel: 'noopener' }, sc.name) : sc.name,
      sc.ru ? h('span', { class: 'chip tone-easy chip-sm', title: t('card.school_ru') }, 'RU') : null,
      sc.note_ru ? h('small', { class: 'muted' }, ` ${sc.note_ru}`) : null))));
  }
  body.append(section(t('sec.schools'), schools));

  if ((spot.pros || []).length || (spot.cons || []).length || spot.hazards) {
    body.append(section(t('sec.proscons'),
      h('div', { class: 'proscons' },
        (spot.pros || []).length ? h('div', {}, h('h4', { class: 'visually-hidden' }, t('card.pros')), h('ul', { class: 'pros' }, ...spot.pros.map((x) => h('li', {}, x)))) : null,
        (spot.cons || []).length ? h('div', {}, h('h4', { class: 'visually-hidden' }, t('card.cons')), h('ul', { class: 'cons' }, ...spot.cons.map((x) => h('li', {}, x)))) : null),
      spot.hazards ? h('p', { class: 'hazards' }, h('b', {}, t('card.hazards')), spot.hazards) : null));
  }

  const v = spot.visa;
  if (isRu) {
    body.append(section(t('sec.visa'),
      h('dl', { class: 'facts' },
        fact(t('card.visa_ru'), visaChip(v, true), v && v.stay_days && !/\d+\s*(дн|сут)/.test(v.label || '') ? h('small', {}, ` ${tn('n.days', v.stay_days)}`) : null),
        v && v.notes ? fact(t('card.visa_notes'), v.notes) : null,
        fact(t('card.airport'), spot.airport || '—')),
      v && (v.source || v.checked) ? h('p', { class: 'source' }, t('card.visa_checked', { d: v.checked || '' }),
        v.source ? h('a', { href: v.source, target: '_blank', rel: 'noopener' }, t('card.source')) : null, t('card.visa_consulate')) : null));
  } else if (spot.airport) {
    body.append(section(t('sec.airport'), h('dl', { class: 'facts' }, fact(t('card.airport'), spot.airport))));
  }

  const links = spot.links || {};
  const linkList = h('ul', { class: 'links' },
    links.windguru ? h('li', {}, h('a', { href: links.windguru, target: '_blank', rel: 'noopener' }, t('card.link_windguru'))) : null,
    links.windfinder ? h('li', {}, h('a', { href: links.windfinder, target: '_blank', rel: 'noopener' }, t('card.link_windfinder'))) : null,
    h('li', {}, h('a', { href: `https://www.windy.com/${spot.lat.toFixed(3)}/${spot.lng.toFixed(3)}?${spot.lat.toFixed(3)},${spot.lng.toFixed(3)},11`, target: '_blank', rel: 'noopener' }, t('card.link_windy'))),
    h('li', {}, h('a', { href: `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`, target: '_blank', rel: 'noopener' }, 'Google Maps')),
    ...(links.other || []).slice(0, 3).map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, new URL(u).hostname.replace('www.', '')))));
  body.append(section(t('sec.links'), linkList,
    (spot.sources || []).length ? h('details', { class: 'sources' }, h('summary', {}, t('card.sources', { n: spot.sources.length })),
      h('ul', {}, ...spot.sources.map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, u))))) : null,
    h('p', { class: 'source' }, t('card.accuracy', { c: t(`confidence.${['high', 'medium', 'low'].includes(spot.confidence) ? spot.confidence : 'none'}`), d: String(spot.updated_at || '').slice(0, 10) }))));

  if (!oldGallery) renderPhotos(gallery, spot);
  body.scrollTop = keepScroll;
  p.classList.add('is-open');
  p.setAttribute('aria-hidden', 'false');
  p.inert = false;
  document.querySelector('.app').classList.add('has-panel');
}

export function showPanelError(text) {
  current = null; prevId = null;
  const p = panel();
  p.querySelector('.panel-body').innerHTML = '';
  p.querySelector('.panel-body').append(h('div', { class: 'p-error' }, h('h2', { id: 'panel-title', tabindex: '-1' }, t('card.error_title')), h('p', {}, text)));
  p.classList.add('is-open');
  p.setAttribute('aria-hidden', 'false');
  p.inert = false;
  document.querySelector('.app').classList.add('has-panel');
}

export function closePanel() {
  current = null; prevId = null;
  const p = panel();
  p.classList.remove('is-open');
  p.setAttribute('aria-hidden', 'true');
  p.inert = true;
  document.querySelector('.app').classList.remove('has-panel');
}

export const currentSpot = () => current;
export { MONTHS };
