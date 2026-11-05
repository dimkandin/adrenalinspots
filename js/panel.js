// Spot detail panel.
import { dryChart, pctChart, snowChart, swellChart, tempChart, windChart, windRose } from './charts.js';
import { ICON, openAbout } from './about.js';
import { track } from './analytics.js';
import { climbForecast, flyForecast, forecast, kitePhotos, placeNames, snowForecast, surfForecast } from './live.js';
import { PREFIX, countryName, isRu, lang, num, t, tn, weekdayShort } from './i18n.js';
import { hasPassport, isRuPassport, passport, visaTableDate } from './visa.js';
import {
  ACCESS, BOLTING, BOTTOM, BREAK, DIVETYPE, FLYING, LEVEL, MONTHS, MONTHS_IN, MONTHS_SHORT, PARK, PG_LEVEL, ROCK, SCHOOLS, SEASON, SNOWMAKING, SPOT_TYPE, STYLE, TIDE, VISA, WATER, WIND_TYPE, WSTYLE,
  climbFeel, cm, compassText, deg, diveSuit, kmh, esc, flagEmoji, getUnit, h, metres, rating, sailSize, vibeLabel, wetsuit, windRangeText, windText, youtubeId,
} from './util.js';

const SPORT_WORD = { kite: 'kitesurfing', surf: 'surfing', snowboard: 'skiing', climbing: 'climbing', paragliding: 'paragliding', windsurf: 'windsurfing', diving: 'scuba diving' };
const sportWord = (spot) => SPORT_WORD[spot.activity] || 'kitesurfing';

const panel = () => document.querySelector('.panel');
let current = null;   // spot detail currently shown
let prevId = null;    // id of the spot rendered last (to detect re-renders)
let ctx = null;       // { month, setMonth }

function meter(value, max = 5, label = '') {
  const wrap = h('span', { class: 'meter', role: 'meter', 'aria-valuemin': 1, 'aria-valuemax': max, 'aria-valuenow': value ?? 0, 'aria-label': label });
  for (let i = 1; i <= max; i++) wrap.append(h('i', { class: value != null && i <= value ? 'on' : '' }));
  return wrap;
}

function contactLink(kind, href, label) {
  return h('a', { class: `sc-ct sc-${kind}`, href, target: '_blank', rel: 'noopener', title: label, 'aria-label': label,
    html: ICON[kind], onclick: () => track('school_contact', { channel: kind }) });
}

const dayMonthYear = (d) => {
  try { return new Date(`${d}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; }
};

/** One school in the «Schools» section: name → its site, lesson languages, contacts, «confirmed by the school». */
function schoolItem(sc) {
  const links = [
    sc.telegram ? contactLink('telegram', `https://t.me/${sc.telegram}`, 'Telegram') : null,
    sc.whatsapp ? contactLink('whatsapp', `https://wa.me/${sc.whatsapp.replace(/\D/g, '')}`, 'WhatsApp') : null,
    sc.vk && isRu ? contactLink('vk', `https://vk.com/${sc.vk}`, 'VK') : null,
  ].filter(Boolean);
  const langs = sc.langs && sc.langs.length ? sc.langs : sc.ru ? ['ru'] : [];
  return h('li', { class: 'school' },
    h('div', { class: 'sc-head' },
      sc.url ? h('a', { class: 'sc-name', href: sc.url, target: '_blank', rel: 'noopener', onclick: () => track('school_site') }, sc.name)
        : h('span', { class: 'sc-name' }, sc.name),
      sc.verified ? h('span', { class: 'sc-ok', title: t('card.school_verified_title', { date: dayMonthYear(sc.verified) }) },
        h('b', { 'aria-hidden': 'true' }, '✓'), ' ', t('card.school_verified')) : null,
      sc.kind && sc.kind !== 'school' ? h('span', { class: 'sc-kind' }, t(`card.school_kind.${sc.kind}`)) : null),
    langs.length || links.length ? h('div', { class: 'sc-meta' },
      langs.length ? h('span', { class: 'sc-langs', title: t('card.school_langs') },
        langs.map((l) => h('span', { class: `chip chip-sm ${l === 'ru' ? 'tone-easy' : 'tone-neutral'}` }, l.toUpperCase()))) : null,
      links.length ? h('span', { class: 'sc-links' }, links) : null) : null,
    sc.note_ru ? h('small', { class: 'muted sc-note' }, sc.note_ru) : null);
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
        h('a', { href: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${sportWord(spot)} ${placeNames(spot.name)[0]}`)}`, target: '_blank', rel: 'noopener' }, t('card.photos_google'))));
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
  kitePhotos(spot.name, snow, spot.activity).then((ph) => {
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
    ? t(v.score < v.auto_score ? 'card.vibe_manual_down' : 'card.vibe_manual', { auto: v.auto_score })
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
  list.append(h('a', { class: 'more-link', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${sportWord(spot)} ${spot.name}`)}`, target: '_blank', rel: 'noopener' },
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

// ---------- surf ------------------------------------------------------------------
const localNum = (text) => String(text).replace(/\d+\.\d+/g, (x) => num(Number(x)));

function waveDirText(dirs) {
  const d = dirs || [];
  if (d.includes('left') && d.includes('right')) return t('wdir.both');
  if (d.includes('left')) return t('wdir.left');
  if (d.includes('right')) return t('wdir.right');
  return '—';
}

function surfFacts(spot) {
  const a = spot.attrs || {};
  return h('dl', { class: 'facts' },
    fact(t('card.break_type'), BREAK[a.break_type] || '—', a.bottom ? h('small', {}, ` ${t('card.bottom_short', { b: BOTTOM[a.bottom] || a.bottom })}`) : null),
    fact(t('card.wave_dir'), waveDirText(a.wave_direction)),
    fact(t('card.level'), (spot.level || []).map((l) => LEVEL[l]).join(', ') || '—'),
    fact(t('card.wave_size'), a.wave_size_m ? `${localNum(a.wave_size_m)} ${t('unit.m')}` : '—'),
    fact(t('card.best_swell'), a.best_swell_dir || '—'),
    fact(t('card.best_wind_surf'), a.best_wind_dir || '—'),
    fact(t('card.best_tide'), TIDE[a.best_tide] || '—'),
    fact(t('card.consistency'), meter(a.consistency, 5, t('card.consistency')), a.consistency ? h('small', {}, ` ${t(`consistency.${a.consistency}`)}`) : null),
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd'), meter(spot.crowd, 5, t('card.crowd_meter')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null),
    fact(t('card.localism'), meter(a.localism, 5, t('card.localism')), a.localism ? h('small', {}, ` ${t(`localism.${a.localism}`)}`) : null),
    a.board_rental != null ? fact(t('card.board_rental'), t(a.board_rental ? 'card.yes' : 'card.no')) : null,
    a.beginner_months_ru ? fact(t('card.beginners'), a.beginner_months_ru) : null,
    a.area_breaks_ru ? fact(t('card.area_breaks'), a.area_breaks_ru) : null);
}

function swellBlock(spot, month) {
  const guide = spot.climate.guide.map((g) => g || {});
  const era5 = spot.climate.era5;
  const e = era5 ? era5[month - 1] || {} : {};
  const g = guide[month - 1] || {};
  const wrap = h('div', {});
  wrap.append(h('div', { class: 'legend' },
    h('span', {}, h('i', { class: 'lg-bar' }), era5 ? t('card.lg_swell_model') : t('card.lg_swell_guide')),
    era5 ? h('span', {}, h('i', { class: 'lg-dot' }), t('card.lg_swell_guide')) : null,
    h('span', {}, h('i', { class: 'lg-threshold' }), t('card.lg_rideable'))));
  const chartHost = h('div', { class: 'chart-host' });
  wrap.append(chartHost);
  swellChart(chartHost, { guide, era5, seasons: spot.seasons, month, onMonth: ctx.setMonth });
  const pct = (v) => (v != null ? `${Math.round(v)}%` : '—');
  wrap.append(h('dl', { class: 'facts facts-3' },
    fact(t('card.swell_in', { in_month: MONTHS_IN[month - 1] }), metres(e.swell_m ?? g.wave_m)),
    fact(t('card.period'), e.swell_s != null ? t('card.period_v', { s: Math.round(e.swell_s) }) : '—'),
    fact(t('card.surf_days'), pct(e.surf_prob)),
    fact(t('card.tide_range'), e.tide_m != null ? metres(e.tide_m) : '—'),
    fact(t('card.clean_mornings'), pct(e.clean_prob))));
  wrap.append(h('p', { class: 'source' }, era5 ? t('card.swell_source', { period: spot.climate_periods.era5 || '' }) : t('card.swell_pending')));
  return wrap;
}

function renderSurfForecast(host, spot) {
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  surfForecast(spot.lat, spot.lng).then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const max = Math.max(2, ...days.map((d) => d.swell || 0));
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      const good = d.swell != null && d.swell >= 0.6 && (d.period || 0) >= 7;
      rows.append(h('div', { class: `fc-row ${good ? 'is-good' : ''}` },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        d.dir != null ? h('span', { class: 'fc-dir', style: `transform: rotate(${Math.round(d.dir + 180)}deg)`, 'aria-label': t('card.fc_swell_dir', { d: Math.round(d.dir) }) }, '↑') : h('span', { class: 'fc-dir' }, ''),
        h('span', { class: 'fc-bar' }, h('i', { class: 'fc-w', style: `width:${((d.swell || 0) / max) * 100}%` })),
        h('span', { class: 'fc-val' }, metres(d.swell), d.period != null ? h('small', {}, ` · ${t('card.period_v', { s: Math.round(d.period) })}`) : null)));
    }
    host.append(rows, h('p', { class: 'source' }, t('card.fc_surf_source')));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

// ---------- diving ------------------------------------------------------------------
const priceLine = (p) => (p ? [`${num(p.eur)} €`, p.year ? t('card.price_year', { y: p.year }) : null].filter(Boolean).join(' · ') : null);
function divingFacts(spot, month) {
  const a = spot.attrs || {};
  const types = (a.dive_types || []).map((x) => h('span', { class: 'tag' }, DIVETYPE[x] || x));
  const vis = a.vis_by_month ? a.vis_by_month[month - 1] : null;
  const note = (p) => (p && p.note_ru ? h('small', { class: 'block' }, p.note_ru) : null);
  return h('dl', { class: 'facts' },
    types.length ? fact(t('card.dive_types'), h('span', { class: 'tags' }, ...types)) : null,
    fact(t('card.dive_access'), (a.access || []).map((x) => ACCESS[x] || x).join(', ') || '—'),
    fact(t('card.level'), (spot.level || []).map((l) => LEVEL[l]).join(', ') || '—'),
    fact(t('card.dive_depth'), a.depth_m ? t('card.metres_range', { v: a.depth_m }) : '—'),
    fact(t('card.visibility'), a.visibility_m ? t('card.metres_range', { v: a.visibility_m }) : '—',
      vis ? h('small', { class: 'block' }, t('card.vis_month', { in_month: MONTHS_IN[month - 1], v: num(vis) })) : null),
    a.current ? fact(t('card.current'), meter(a.current, 5, t('card.current')), h('small', {}, ` ${t(`current.${a.current}`)}`)) : null,
    a.snorkeling != null ? fact(t('card.snorkeling'), a.snorkeling ? t('card.snorkel_yes') : t('card.no')) : null,
    a.signature_sites_ru ? fact(t('card.dive_sites'), a.signature_sites_ru) : null,
    a.dive_price ? fact(t('card.dive_price'), priceLine(a.dive_price), note(a.dive_price)) : null,
    a.course_price ? fact(t('card.course_price'), priceLine(a.course_price), note(a.course_price)) : null,
    a.chamber_ru ? fact(t('card.chamber'), a.chamber_ru) : null,
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd'), meter(spot.crowd, 5, t('card.crowd_meter')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null));
}
/** What to see underwater and when: one row per highlight with its months, then visibility by month. */
function lifeBlock(spot, month, setMonth) {
  const a = spot.attrs || {};
  const wrap = h('div', { class: 'life' });
  if (a.marine_life_ru) wrap.append(h('p', {}, a.marine_life_ru));
  const strip = (on, label) => h('span', { class: 'hl-strip', role: 'img', 'aria-label': label },
    ...MONTHS_SHORT.map((name, i) => h('i', { class: `${on(i) ? 'on' : ''}${i === month - 1 ? ' now' : ''}`, title: name })));
  const rows = (a.highlights || []).map((x) => {
    const months = x.months || [];
    const all = !months.length;
    const here = all || months.includes(month);
    return h('li', { class: `hl${here ? ' is-here' : ''}` },
      h('span', { class: 'hl-name' }, x.what_ru, here && !all ? h('b', { class: 'hl-now' }, t('card.hl_now', { in_month: MONTHS_IN[month - 1] })) : null),
      all ? h('span', { class: 'hl-all' }, t('card.hl_all_year'))
        : strip((i) => months.includes(i + 1), `${x.what_ru}: ${months.map((m) => MONTHS[m - 1]).join(', ')}`));
  });
  if (rows.length) wrap.append(h('ul', { class: 'hls' }, ...rows));
  if (a.vis_by_month && a.vis_by_month.some((v) => v)) {
    const cells = MONTHS_SHORT.map((name, i) => {
      const v = a.vis_by_month[i];
      return h('button', { type: 'button', class: `sail-m${i === month - 1 ? ' is-now' : ''}${spot.seasons[i] === 'off' ? ' is-off' : ''}`,
        'aria-label': `${MONTHS[i]}: ${v ? `${num(v)} ${t('unit.m')}` : '—'}`, 'aria-pressed': i === month - 1 ? 'true' : 'false',
        onclick: setMonth ? () => setMonth(i + 1) : null },
      h('span', { class: 'sail-name' }, name), h('b', {}, v ? num(v) : '—'));
    });
    wrap.append(h('h4', { class: 'sub' }, t('card.vis_by_month')), h('div', { class: 'sail-strip' }, ...cells),
      h('p', { class: 'source' }, t('card.vis_note')));
  }
  return wrap;
}
function renderSeaForecast(host, spot) {
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  surfForecast(spot.lat, spot.lng).then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const max = Math.max(2, ...days.map((d) => d.swell || 0));
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      const calm = d.swell != null && d.swell < 1;
      rows.append(h('div', { class: `fc-row ${calm ? 'is-good' : ''}` },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        h('span', { class: 'fc-dir' }, ''),
        h('span', { class: 'fc-bar' }, h('i', { class: 'fc-w', style: `width:${((d.swell || 0) / max) * 100}%` })),
        h('span', { class: 'fc-val' }, metres(d.swell), h('small', {}, ` · ${calm ? t('card.fc_calm') : t('card.fc_rough')}`))));
    }
    host.append(rows, h('p', { class: 'source' }, t('card.fc_dive_source')));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

// ---------- mountains (ski & snowboard) ---------------------------------------------
const midHeight = (a) => (a.base_m && a.top_m ? (a.base_m + a.top_m) / 2 : (a.top_m || a.base_m || null));

function pistesBar(a) {
  const parts = [['easy', a.easy_km], ['medium', a.medium_km], ['hard', a.hard_km]];
  const total = parts.reduce((x, [, v]) => x + (v || 0), 0);
  if (!total) return null;
  return h('span', { class: 'pistes' },
    h('span', { class: 'pistes-bar', 'aria-hidden': 'true' }, ...parts.filter(([, v]) => v).map(([k, v]) => h('i', { class: `pb-${k}`, style: `flex:${v}` }))),
    h('small', { class: 'block' }, parts.filter(([, v]) => v != null).map(([k, v]) => `${t(`pistes.${k}`)} ${num(Math.round(v))}`).join(' · ')));
}

function passText(a) {
  const lp = a.lift_pass;
  if (!lp || lp.price == null) return '—';
  const money = new Intl.NumberFormat(document.documentElement.lang || 'ru', { style: 'currency', currency: lp.currency || 'EUR', maximumFractionDigits: 0 }).format(lp.price);
  const eur = lp.currency && lp.currency !== 'EUR' && a.lift_pass_eur ? ` (~${num(Math.round(a.lift_pass_eur))} €)` : '';
  return `${money}${eur}`;
}

function mountainFacts(spot) {
  const a = spot.attrs || {};
  const flags = [a.glacier ? t('mtn.glacier') : null, a.summer_ski ? t('mtn.summer_ski') : null, a.night_skiing ? t('mtn.night') : null,
    a.heliski ? t('mtn.heliski') : null].filter(Boolean);
  return h('dl', { class: 'facts' },
    fact(t('card.heights'), a.base_m && a.top_m ? `${num(a.base_m)}–${num(a.top_m)} ${t('unit.m')}` : '—',
      a.vertical_m ? h('small', {}, ` ${t('card.vertical_v', { v: num(a.vertical_m) })}`) : null),
    fact(t('card.pistes'), a.pistes_km ? `${num(Math.round(a.pistes_km))} ${t('unit.km')}` : '—', pistesBar(a)),
    fact(t('card.lifts'), a.lifts != null ? String(a.lifts) : '—', a.longest_run_km ? h('small', {}, ` ${t('card.longest_run', { v: num(a.longest_run_km) })}`) : null),
    fact(t('card.season_mtn'), a.season_ru || '—'),
    fact(t('card.lift_pass'), passText(a), a.lift_pass && (a.lift_pass.note_ru || a.lift_pass.season)
      ? h('small', { class: 'block' }, [a.lift_pass.note_ru, a.lift_pass.season ? t('card.pass_season', { s: a.lift_pass.season }) : null].filter(Boolean).join(' · ')) : null),
    fact(t('card.beginner_mtn'), meter(a.beginner, 5, t('card.beginner_mtn'))),
    fact(t('card.freeride'), meter(a.freeride, 5, t('card.freeride')), a.freeride ? h('small', {}, ` ${t(`freeride.${a.freeride}`)}`) : null),
    fact(t('card.snowpark'), a.snowpark ? PARK[a.snowpark] : '—'),
    fact(t('card.apres'), meter(a.apres, 5, t('card.apres'))),
    a.snowmaking ? fact(t('card.snowmaking'), SNOWMAKING[a.snowmaking]) : null,
    flags.length ? fact(t('card.also'), flags.join(', ')) : null,
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd_mtn'), meter(spot.crowd, 5, t('card.crowd_mtn')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null),
    a.transfer_ru ? fact(t('card.transfer'), a.transfer_ru) : null);
}

function snowBlock(spot, month) {
  const guide = spot.climate.guide.map((g) => g || {});
  // where the snow model plainly misses the resort's snow, the guides' estimate stands in for it
  const low = !!spot.climate.snow_model_low;
  const era5 = low ? null : spot.climate.era5;
  const sun = spot.climate.era5 ? (spot.climate.era5[month - 1] || {}).sun_h : null;
  const e = era5 ? era5[month - 1] || {} : {};
  const g = guide[month - 1] || {};
  const wrap = h('div', {});
  wrap.append(h('div', { class: 'legend' },
    h('span', {}, h('i', { class: 'lg-bar' }), era5 ? t('card.lg_snow_model') : t('card.lg_snow_guide')),
    era5 ? h('span', {}, h('i', { class: 'lg-dot' }), t('card.lg_snow_guide')) : null,
    h('span', {}, h('i', { class: 'lg-threshold' }), t('card.lg_snow_30'))));
  const chartHost = h('div', { class: 'chart-host' });
  wrap.append(chartHost);
  snowChart(chartHost, { guide, era5, seasons: spot.seasons, month, onMonth: ctx.setMonth });
  const pct = (v) => (v != null ? `${Math.round(v)}%` : '—');
  wrap.append(h('dl', { class: 'facts facts-3' },
    fact(t('card.snow_in', { in_month: MONTHS_IN[month - 1] }), cm(e.snow_cm ?? g.snow_cm)),
    low ? null : fact(t('card.snowfall'), e.snowfall_cm != null ? cm(e.snowfall_cm) : '—'),
    low ? null : fact(t('card.snow_days'), e.snow_days != null ? num(Math.round(e.snow_days)) : '—'),
    low ? null : fact(t('card.ski_days'), pct(e.ski_prob)),
    fact(t('card.sun'), sun != null ? t('card.sun_v', { h: num(sun, 1) }) : '—')));
  wrap.append(h('p', { class: 'source' }, low ? t('card.snow_model_low')
    : era5 ? t('card.snow_source', { period: spot.climate_periods.era5 || '', h: num(Math.round(midHeight(spot.attrs || {}) || 0)) }) : t('card.snow_pending')));
  return wrap;
}

function renderSnowForecast(host, spot) {
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  snowForecast(spot.lat, spot.lng, midHeight(spot.attrs || {})).then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const max = Math.max(20, ...days.map((d) => d.snow || 0));
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      const good = (d.snow || 0) >= 10;
      rows.append(h('div', { class: `fc-row ${good ? 'is-good' : ''}` },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        h('span', { class: 'fc-dir', 'aria-hidden': 'true' }, d.snow > 0.5 ? '❄' : (d.sun > 6 ? '☀' : '')),
        h('span', { class: 'fc-bar' }, h('i', { class: 'fc-w fc-snow', style: `width:${((d.snow || 0) / max) * 100}%` })),
        h('span', { class: 'fc-val' }, d.snow > 0.5 ? cm(d.snow) : t('card.fc_no_snow'),
          h('small', {}, ` · ${deg(d.tmin)}…${deg(d.tmax)}`))));
    }
    host.append(rows, h('p', { class: 'source' }, t('card.fc_snow_source', { h: num(Math.round(midHeight(spot.attrs || {}) || 0)) })));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

// ---------- climbing -------------------------------------------------------------------
const isBoulder = (a) => a.main_style === 'boulder';

function gradesBar(a) {
  const g = a.grades;
  if (!g) return null;
  const b = isBoulder(a) ? '_b' : '';
  const parts = [['easy', g.easy], ['medium', g.mid], ['hard', g.hard]];
  return h('span', { class: 'pistes grades' },
    h('span', { class: 'pistes-bar', 'aria-hidden': 'true' }, ...parts.filter(([, v]) => v).map(([k, v]) => h('i', { class: `pb-${k}`, style: `flex:${v}` }))),
    h('small', { class: 'block' }, [['easy', g.easy], ['mid', g.mid], ['hard', g.hard]].map(([k, v]) => `${t(`grades.${k}${b}`)} ${v}%`).join(' · ')));
}

function gradeRange(a) {
  const rope = a.grade_min || a.grade_max ? `${a.grade_min || '…'}–${a.grade_max || '…'}` : null;
  const bould = a.boulder_min || a.boulder_max ? `Font ${a.boulder_min || '…'}–${a.boulder_max || '…'}` : null;
  return [rope, bould].filter(Boolean).join(' · ') || '—';
}

function climbFacts(spot) {
  const a = spot.attrs || {};
  const counts = [a.routes ? tn('n.routes', a.routes) : null, a.boulders ? tn('n.problems', a.boulders) : null,
    a.sectors ? tn('n.sectors', a.sectors) : null].filter(Boolean).join(' · ');
  const yesNo = (v) => t(v ? 'card.yes' : 'card.no');
  return h('dl', { class: 'facts' },
    fact(t('card.styles'), (a.styles || []).map((x) => STYLE[x] || x).join(' · ') || '—'),
    fact(t('card.rock'), ROCK[a.rock] || '—', a.rock_note_ru ? h('small', { class: 'block' }, a.rock_note_ru) : null),
    fact(t('card.routes'), counts || '—'),
    fact(t('card.grades'), gradeRange(a), gradesBar(a)),
    fact(t('card.beginner_climb'), meter(a.beginner, 5, t('card.beginner_climb'))),
    fact(t('card.hard_climb'), meter(a.hard, 5, t('card.hard_climb'))),
    fact(t('card.shade'), meter(a.shade, 5, t('card.shade'))),
    fact(t('card.sun_sectors'), meter(a.sun, 5, t('card.sun_sectors'))),
    a.rain_ok != null ? fact(t('card.rain_ok'), meter(a.rain_ok, 3, t('card.rain_ok')), h('small', {}, ` ${t(`rain_ok.${a.rain_ok}`)}`)) : null,
    a.elevation_m != null ? fact(t('card.elevation'), `~${num(a.elevation_m)} ${t('unit.m')}`) : null,
    a.rope_m || a.bolting ? fact(t('card.gear'), [a.rope_m ? t('card.rope_v', { v: a.rope_m }) : null, a.bolting ? BOLTING[a.bolting] : null].filter(Boolean).join(' · ')) : null,
    a.approach_ru || a.approach_min ? fact(t('card.approach'), a.approach_ru || t('card.min_v', { v: a.approach_min })) : null,
    a.season_ru ? fact(t('card.season_mtn'), a.season_ru) : null,
    a.restrictions_ru ? fact(t('card.restrictions'), a.restrictions_ru) : null,
    (a.famous_lines_ru || []).length ? fact(t('card.famous'), a.famous_lines_ru.join('; ')) : null,
    a.guidebook_ru ? fact(t('card.guidebook'), a.guidebook_ru) : null,
    a.gear_rental != null ? fact(t('card.gear_rental'), yesNo(a.gear_rental)) : null,
    a.camping != null ? fact(t('card.camping'), yesNo(a.camping)) : null,
    a.stay_ru ? fact(t('card.stay'), a.stay_ru) : null,
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd_climb'), meter(spot.crowd, 5, t('card.crowd_climb')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null),
    a.transfer_ru ? fact(t('card.transfer'), a.transfer_ru) : null);
}

function climbBlock(spot, month) {
  const era5 = spot.climate.era5;
  const e = era5 ? era5[month - 1] || {} : {};
  const a = spot.attrs || {};
  const wrap = h('div', {});
  wrap.append(h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'lg-bar' }), t('card.lg_dry'))));
  const chartHost = h('div', { class: 'chart-host' });
  wrap.append(chartHost);
  dryChart(chartHost, { era5, seasons: spot.seasons, month, onMonth: ctx.setMonth });
  const feel = climbFeel(e.air_c, isBoulder(a));
  wrap.append(h('dl', { class: 'facts facts-3' },
    fact(t('card.dry_in', { in_month: MONTHS_IN[month - 1] }), e.dry_prob != null ? `${Math.round(e.dry_prob)}%` : '—'),
    fact(t('card.rain_days'), e.rain_days != null ? num(Math.round(e.rain_days)) : '—'),
    fact(t('card.day_night'), e.air_c != null ? `${deg(e.air_c)} / ${deg(e.tmin_c)}` : '—'),
    fact(t('card.humidity'), e.hum_pct != null ? `${Math.round(e.hum_pct)}%` : '—'),
    fact(t('card.sun'), e.sun_h != null ? t('card.sun_v', { h: num(e.sun_h, 1) }) : '—'),
    fact(t('card.feel'), feel ? t(`feel.${feel}`) : '—')));
  wrap.append(h('p', { class: 'source' }, era5
    ? t(a.elevation_m ? 'card.climb_source' : 'card.climb_source_noh', { period: spot.climate_periods.era5 || '', h: num(a.elevation_m || 0) })
    : t('card.climb_pending')));
  return wrap;
}

function renderClimbForecast(host, spot) {
  const a = spot.attrs || {};
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  climbForecast(spot.lat, spot.lng, a.elevation_m).then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      const wet = (d.rain || 0) >= 1;
      const feel = climbFeel(d.tmax, isBoulder(a));
      const good = !wet && (feel === 'great' || feel === 'great_b');
      rows.append(h('div', { class: `fc-row ${good ? 'is-good' : ''}` },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        h('span', { class: 'fc-dir', 'aria-hidden': 'true' }, wet ? '☔' : (d.sun > 6 ? '☀' : '☁')),
        h('span', { class: 'fc-bar' }, h('i', { class: 'fc-w fc-rain', style: `width:${Math.min(100, d.prob ?? (wet ? 100 : 0))}%` })),
        h('span', { class: 'fc-val' }, wet ? t('card.fc_rain', { v: num(Math.round(d.rain)) }) : t('card.fc_dry'),
          h('small', {}, ` · ${deg(d.tmin)}…${deg(d.tmax)}`))));
    }
    host.append(rows, h('p', { class: 'source' }, t(a.elevation_m ? 'card.fc_climb_source' : 'card.fc_climb_source_noh', { h: num(a.elevation_m || 0) })));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

// ---------- paragliding ------------------------------------------------------------------
function priceText(tp, eur) {
  if (!tp || tp.price == null) return null;
  const money = new Intl.NumberFormat(document.documentElement.lang || 'ru', { style: 'currency', currency: tp.currency || 'EUR', maximumFractionDigits: 0 }).format(tp.price);
  return `${money}${tp.currency && tp.currency !== 'EUR' && eur ? ` (~${num(Math.round(eur))} €)` : ''}`;
}

// ---------- windsurf ----------------------------------------------------------------
const monthWind = (spot, i) => {
  const g = spot.climate.guide[i]; const e = spot.climate.era5 ? spot.climate.era5[i] : null;
  return (g && g.wind_kn != null ? g.wind_kn : null) ?? (e && e.wind_kn != null ? e.wind_kn : null);
};
function windsurfFacts(spot, month) {
  const a = spot.attrs || {};
  const water = (spot.water || []).map((w) => h('span', { class: `tag water-${w}` }, WATER[w] || w));
  const styles = (a.styles || []).map((st) => h('span', { class: `tag${st === a.main_style ? ' tag-main' : ''}` }, WSTYLE[st] || st));
  const sail = sailSize(monthWind(spot, month - 1));
  const rental = a.rental == null ? null : a.rental
    ? [priceText(a.rental_price, a.rental_price_eur) ? t('card.ws_rental_price', { p: priceText(a.rental_price, a.rental_price_eur) }) : t('card.yes'),
      a.rental_price && a.rental_price.season ? t('card.price_year', { y: a.rental_price.season }) : null].filter(Boolean).join(' · ')
    : t('card.no');
  return h('dl', { class: 'facts' },
    fact(t('card.wind_range'), windRangeText(spot.wind_range) || '—'),
    fact(t('card.direction'), spot.wind_dir || '—', spot.wind_type ? h('small', {}, ` ${WIND_TYPE[spot.wind_type] || spot.wind_type}`) : null),
    fact(t('card.gustiness'), meter(spot.gustiness, 5, t('card.gustiness')), h('small', {}, ` ${gustText(spot.gustiness)}`), spot.gustiness_note ? h('small', { class: 'block' }, spot.gustiness_note) : null),
    styles.length ? fact(t('card.ws_styles'), h('span', { class: 'tags' }, ...styles)) : null,
    fact(t('card.water'), h('span', { class: 'tags' }, ...water)),
    fact(t('card.waves'), spot.waves_note || '—'),
    a.launch_ru ? fact(t('card.ws_launch'), a.launch_ru) : null,
    fact(t('card.ws_sail'), sail ? t('card.ws_sail_month', { in_month: MONTHS_IN[month - 1], v: num(sail, 1) }) : '—',
      a.sail_note_ru ? h('small', { class: 'block' }, a.sail_note_ru) : null),
    rental ? fact(t('card.ws_rental'), rental, a.rental_price && a.rental_price.note_ru ? h('small', { class: 'block' }, a.rental_price.note_ru) : null) : null,
    a.speed_spot ? fact(t('card.ws_speed'), t('card.ws_speed_yes')) : null,
    a.events_ru ? fact(t('card.events'), a.events_ru) : null,
    fact(t('card.depth'), spot.depth ? t(`depth.${spot.depth}`) : '—'),
    fact(t('card.level'), (spot.level || []).map((l) => LEVEL[l]).join(', ') || '—'),
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd'), meter(spot.crowd, 5, t('card.crowd_meter')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null));
}
/** Twelve months of the usual sail size, the current month marked, months out of season dimmed. */
function sailStrip(spot, month, setMonth) {
  const cells = MONTHS_SHORT.map((name, i) => {
    const v = sailSize(monthWind(spot, i));
    const off = spot.seasons[i] === 'off';
    return h('button', { type: 'button', class: `sail-m${i === month - 1 ? ' is-now' : ''}${off ? ' is-off' : ''}`,
      'aria-label': `${MONTHS[i]}: ${v ? `${num(v, 1)} ${t('unit.m2')}` : t('card.ws_sail_none')}`, 'aria-pressed': i === month - 1 ? 'true' : 'false',
      onclick: setMonth ? () => setMonth(i + 1) : null },
    h('span', { class: 'sail-name' }, name), h('b', {}, v ? num(v, 1) : '—'));
  });
  return h('div', {}, h('div', { class: 'sail-strip', role: 'group', 'aria-label': t('sec.ws_sail') }, ...cells),
    h('p', { class: 'source' }, t('card.ws_sail_note')));
}

function paraFacts(spot) {
  const a = spot.attrs || {};
  const yesNo = (v) => t(v ? 'card.yes' : 'card.no');
  const diff = a.takeoff_m != null && a.landing_m != null ? a.takeoff_m - a.landing_m : null;
  const tandem = a.tandem == null ? null : a.tandem
    ? [priceText(a.tandem_price, a.tandem_price_eur) || t('card.yes'), a.tandem_price && a.tandem_price.season ? t('card.price_year', { y: a.tandem_price.season }) : null].filter(Boolean).join(' · ')
    : t('card.no');
  return h('dl', { class: 'facts' },
    fact(t('card.heights_pg'), a.takeoff_m != null ? `${num(a.takeoff_m)} / ${a.landing_m != null ? num(a.landing_m) : '…'} ${t('unit.m')}` : '—',
      diff ? h('small', {}, ` ${t('card.vertical_v', { v: num(diff) })}`) : null,
      a.takeoffs_ru ? h('small', { class: 'block' }, a.takeoffs_ru) : null),
    fact(t('card.flying_type'), FLYING[a.flying_type] || '—'),
    fact(t('card.takeoff_dirs'), (a.takeoff_dirs || []).map(compassText).join(', ') || '—', a.wind_ru ? h('small', { class: 'block' }, a.wind_ru) : null),
    a.best_time_ru ? fact(t('card.best_time'), a.best_time_ru) : null,
    a.access_ru || a.cable_car != null ? fact(t('card.access'), a.access_ru || (a.cable_car ? t('card.cable_car') : '—')) : null,
    tandem != null ? fact(t('card.tandem'), tandem, a.tandem_price && a.tandem_price.note_ru ? h('small', { class: 'block' }, a.tandem_price.note_ru) : null) : null,
    a.courses != null ? fact(t('card.courses'), yesNo(a.courses)) : null,
    a.rental != null ? fact(t('card.rental'), yesNo(a.rental)) : null,
    fact(t('card.beginner_pg'), meter(a.beginner, 5, t('card.beginner_pg'))),
    fact(t('card.xc'), meter(a.xc, 5, t('card.xc')), a.xc_note_ru ? h('small', { class: 'block' }, a.xc_note_ru) : null),
    (spot.level || []).length ? fact(t('card.levels'), spot.level.map((l) => PG_LEVEL[l] || l).join(', ')) : null,
    a.rules_ru ? fact(t('card.rules'), a.rules_ru) : null,
    a.landing_ru ? fact(t('card.landing_pg'), a.landing_ru) : null,
    a.events_ru ? fact(t('card.events'), a.events_ru) : null,
    a.season_ru ? fact(t('card.season_mtn'), a.season_ru) : null,
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd_pg'), meter(spot.crowd, 5, t('card.crowd_pg')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null),
    a.transfer_ru ? fact(t('card.transfer'), a.transfer_ru) : null);
}

function flyBlock(spot, month) {
  const era5 = spot.climate.era5;
  const e = era5 ? era5[month - 1] || {} : {};
  const wrap = h('div', {});
  wrap.append(h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'lg-bar' }), t('card.lg_fly'))));
  const chartHost = h('div', { class: 'chart-host' });
  wrap.append(chartHost);
  pctChart(chartHost, { era5, seasons: spot.seasons, month, onMonth: ctx.setMonth, key: 'fly_prob', aria: t('chart.fly_aria'), empty: t('chart.no_dry'),
    rows: (x) => [
      x.fly_prob != null ? t('chart.fly', { p: Math.round(x.fly_prob) }) : null,
      x.wind_kn != null ? t('chart.wind_gust', { w: kmh(x.wind_kn), g: kmh(x.gust_kn) }) : null,
      x.rain_days != null ? t('chart.rain_days', { n: num(Math.round(x.rain_days)) }) : null,
      x.cloudbase_m != null ? t('chart.cloudbase', { v: num(x.cloudbase_m) }) : null,
    ] });
  wrap.append(h('dl', { class: 'facts facts-3' },
    fact(t('card.fly_in', { in_month: MONTHS_IN[month - 1] }), e.fly_prob != null ? `${Math.round(e.fly_prob)}%` : '—'),
    fact(t('card.wind_day'), kmh(e.wind_kn)),
    fact(t('card.gust_day'), kmh(e.gust_kn)),
    fact(t('card.rain_days'), e.rain_days != null ? num(Math.round(e.rain_days)) : '—'),
    fact(t('card.cloudbase'), e.cloudbase_m != null ? t('card.cloudbase_v', { v: num(e.cloudbase_m) }) : '—'),
    fact(t('card.sun'), e.sun_h != null ? t('card.sun_v', { h: num(e.sun_h, 1) }) : '—')));
  wrap.append(h('p', { class: 'source' }, era5 ? t('card.fly_source', { period: spot.climate_periods.era5 || '' }) : t('card.fly_pending')));
  return wrap;
}

function renderParaForecast(host, spot) {
  const a = spot.attrs || {};
  host.innerHTML = '';
  host.append(h('p', { class: 'muted' }, t('card.fc_loading')));
  flyForecast(spot.lat, spot.lng, a.takeoff_dirs || [], a.flying_type || 'thermal').then((days) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    const rows = h('div', { class: 'fc' });
    for (const d of days) {
      const date = new Date(d.date + 'T12:00:00');
      rows.append(h('div', { class: `fc-row ${d.fly >= 3 && d.rain < 5 ? 'is-good' : ''}` },
        h('span', { class: 'fc-day' }, `${weekdayShort(date)} ${date.getDate()}`),
        h('span', { class: 'fc-dir', style: `transform: rotate(${Math.round(d.dir + 180)}deg)`, 'aria-label': t('card.fc_dir', { d: Math.round(d.dir) }) }, '↑'),
        h('span', { class: 'fc-bar' }, h('i', { class: 'fc-w', style: `width:${(d.fly / 8) * 100}%` })),
        h('span', { class: 'fc-val' }, t('card.fc_fly_hours', { n: d.fly }),
          h('small', {}, ` · ${kmh(d.max)} / ${kmh(d.gust)}${d.rain >= 1 ? ` · ☔ ${num(Math.round(d.rain))} ${t('unit.mm')}` : ''}`))));
    }
    host.append(rows, h('p', { class: 'source' }, t('card.fc_pg_source')));
  }).catch((e) => {
    if (!current || current.id !== spot.id) return;
    host.innerHTML = '';
    host.append(h('p', { class: 'muted' }, t('card.fc_error', { msg: e.message })));
  });
}

function distKm(a, b) {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/** «Nearby and similar»: spots of the same sport within 500 km, and other places with a great season this month. */
function nearbyBlock(spot, month, c) {
  if (!c || !c.open || spot.activity !== c.activity || spot.lat == null) return null;
  const all = (c.spots || []).filter((s) => s.id !== spot.id && s.lat != null);
  const near = all.map((s) => ({ s, d: distKm(spot, s) })).filter((x) => x.d <= 500).sort((a, b) => a.d - b.d).slice(0, 5);
  const nearIds = new Set(near.map((x) => x.s.id));
  const countries = new Set([spot.cc]);   // one place per country, so the list shows other directions
  const like = all.filter((s) => !nearIds.has(s.id) && (s.seasons || [])[month - 1] === 'peak')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.popularity || 0) - (a.popularity || 0))
    .filter((s) => !countries.has(s.cc) && countries.add(s.cc)).slice(0, 4);
  if (!near.length && !like.length) return null;
  const item = (s, d) => h('li', {}, h('button', {
    type: 'button', class: 'nb-item', onclick: () => { track('open_related', { from: spot.id, to: s.id }); c.open(s.id); },
  },
  h('i', { class: `nb-dot nb-${(s.seasons || [])[month - 1] || 'off'}`, title: (SEASON[(s.seasons || [])[month - 1]] || SEASON.off).label }),
  h('span', { class: 'nb-name' }, s.name_ru || s.name),
  h('span', { class: 'nb-meta' }, [d != null ? t('card.km', { v: num(d < 50 ? Math.round(d) : Math.round(d / 10) * 10) }) : countryName(s.cc, s.country),
    s.rating ? `★ ${rating(s.rating)}` : null].filter(Boolean).join(' · '))));
  return h('div', { class: 'nearby' },
    near.length ? h('h4', { class: 'sub' }, t('card.nearby')) : null,
    near.length ? h('ul', { class: 'nb-list' }, ...near.map((x) => item(x.s, x.d))) : null,
    like.length ? h('h4', { class: 'sub' }, t('card.also_peak', { in_month: MONTHS_IN[month - 1] })) : null,
    like.length ? h('ul', { class: 'nb-list' }, ...like.map((s) => item(s, null))) : null);
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>';

function miniToast(text) {
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

/** «Share»: the phone's share sheet where there is one, otherwise the link goes to the clipboard.
 *  The link is the spot's own page (its link preview shows this spot) with the month the visitor is looking at. */
function shareButton(spot, month, season) {
  return h('button', {
    type: 'button', class: 'chip chip-share', html: `${SHARE_ICON}<span>${t('card.share')}</span>`,
    onclick: async () => {
      const url = `${location.origin}${PREFIX}/spot/${encodeURIComponent(spot.id)}#m=${month}`;
      const text = t(`share.text_${season === 'peak' ? 'peak' : season === 'off' ? 'off' : 'mid'}`, { name: spot.name_ru, in_month: MONTHS_IN[month - 1] });
      track('share', { spot: spot.id, activity: spot.activity });
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: document.title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(`${text} ${url}`); miniToast(t('card.share_copied')); } catch { miniToast(url); }
    },
  });
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
    // why this rating: folded away, because it often retells the description below
    spot.rating_basis ? h('details', { class: 'p-basis' }, h('summary', {}, t('card.rating_why', { r: rating(spot.rating) })), h('p', { class: 'muted' }, spot.rating_basis)) : null,
    h('div', { class: 'chips' }, seasonChip(season, month), hasPassport() ? visaChip(spot.visa) : null,
      isRu && spot.ru_schools === 'yes' ? h('span', { class: 'chip tone-easy' }, t('card.ru_schools_chip')) : null,
      shareButton(spot, month, season)));

  const isSurf = spot.activity === 'surf';
  const isMtn = spot.activity === 'snowboard';
  const isClimb = spot.activity === 'climbing';
  const isFly = spot.activity === 'paragliding';
  const isWind = spot.activity === 'windsurf';
  const isDive = spot.activity === 'diving';
  const water = (spot.water || []).map((w) => h('span', { class: `tag water-${w}` }, WATER[w] || w));
  const era = spot.climate.era5 ? spot.climate.era5[month - 1] : null;
  const facts = isDive ? divingFacts(spot, month) : isWind ? windsurfFacts(spot, month) : isFly ? paraFacts(spot) : isClimb ? climbFacts(spot) : isMtn ? mountainFacts(spot) : isSurf ? surfFacts(spot) : h('dl', { class: 'facts' },
    fact(t('card.wind_range'), windRangeText(spot.wind_range) || '—'),
    fact(t('card.direction'), spot.wind_dir || '—', spot.wind_type ? h('small', {}, ` ${WIND_TYPE[spot.wind_type] || spot.wind_type}`) : null),
    fact(t('card.gustiness'), meter(spot.gustiness, 5, t('card.gustiness')), h('small', {}, ` ${gustText(spot.gustiness)}`), spot.gustiness_note ? h('small', { class: 'block' }, spot.gustiness_note) : null),
    fact(t('card.water'), h('span', { class: 'tags' }, ...water)),
    fact(t('card.waves'), spot.waves_note || '—', era && era.wave_m != null ? h('small', { class: 'block' }, t('card.waves_avg', { m: num(era.wave_m, 1), in_month: MONTHS_IN[month - 1] })) : null),
    spot.wave_riding ? fact(t('card.wave_riding'), meter(spot.wave_riding, 3, t('card.wave_riding')), h('small', {}, ` ${t(`wave_riding.${spot.wave_riding}`)}`)) : null,
    fact(t('card.depth'), spot.depth ? t(`depth.${spot.depth}`) : '—'),
    fact(t('card.spot_type'), SPOT_TYPE[spot.spot_type] || spot.spot_type || '—'),
    fact(t('card.level'), (spot.level || []).map((l) => LEVEL[l]).join(', ') || '—'),
    fact(t('card.popularity'), meter(spot.popularity, 5, t('card.popularity'))),
    fact(t('card.crowd'), meter(spot.crowd, 5, t('card.crowd_meter')), spot.crowd_note ? h('small', {}, ` ${spot.crowd_note}`) : null));

  body.append(gallery, header);
  if (spot.description) body.append(h('p', { class: 'p-desc' }, spot.description));
  body.append(section(t('sec.conditions'), facts));
  body.append(section(t('sec.vibe'), vibeBlock(spot)));
  body.append(isDive ? section(t('sec.dive_life'), lifeBlock(spot, month, ctx && ctx.setMonth)) : isFly ? section(t('sec.fly'), flyBlock(spot, month)) : isClimb ? section(t('sec.climb_weather'), climbBlock(spot, month)) : isMtn ? section(t('sec.snow'), snowBlock(spot, month))
    : isSurf ? section(t('sec.swell'), swellBlock(spot, month)) : section(t('sec.wind'), climateBlock(spot, month)));
  if (isWind && spot.climate.guide.concat(spot.climate.era5 || []).some((x) => x && x.wind_kn != null)) {
    body.append(section(t('sec.ws_sail'), sailStrip(spot, month, ctx && ctx.setMonth)));
  }

  const tempHost = h('div', { class: 'chart-host' });
  const g = spot.climate.guide[month - 1] || {};
  const hasWater = !isMtn && !isClimb && !isFly && (spot.climate.guide.some((x) => x && x.water_c != null)
    || (spot.climate.era5 || []).some((x) => x && x.water_c != null));
  const hasNight = (isMtn || isClimb || isFly) && (spot.climate.era5 || []).some((x) => x && x.tmin_c != null);
  body.append(section(t('sec.temp'),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'lg-line air' }), isMtn ? t('chart.air_mtn') : isClimb ? t('chart.air_climb') : isFly ? t('chart.air_takeoff') : t('chart.air_day')),
      hasWater ? h('span', {}, h('i', { class: 'lg-line water' }), t('chart.water_cap')) : null,
      hasNight ? h('span', {}, h('i', { class: 'lg-line water' }), t('chart.night_cap')) : null),
    tempHost,
    h('dl', { class: `facts ${(isSurf || isDive) && hasWater ? 'facts-3' : hasWater ? 'facts-2' : 'facts-1'}` },
      fact(t('card.air_in', { in_month: MONTHS_IN[month - 1] }), deg(isClimb || isFly ? ((era && era.air_c) ?? g.air_c) : (g.air_c ?? (era && era.air_c)))),
      hasWater ? fact(t('card.water'), deg(g.water_c ?? (era && era.water_c))) : null,
      isSurf && hasWater ? fact(t('card.wetsuit'), wetsuit((era && era.water_c) ?? g.water_c) || '—') : null,
      isDive && hasWater ? fact(t('card.divesuit'), diveSuit(g.water_c ?? (era && era.water_c)) || '—') : null,
      hasNight ? fact(t('card.night_in'), deg(era && era.tmin_c)) : null)));
  tempChart(tempHost, { guide: spot.climate.guide, era5: spot.climate.era5, month, night: isMtn || isClimb || isFly });

  if (isSurf && era && era.swell_rose && era.swell_rose.some((x) => x > 0)) {
    const roseHost = h('div', { class: 'rose-host' });
    body.append(section(t('sec.swell_rose', { in_month: MONTHS_IN[month - 1] }), roseHost));
    const share = windRose(roseHost, era.swell_rose);
    roseHost.append(h('p', { class: 'source' }, t('card.swell_rose_note', { p: share, period: spot.climate_periods.era5 })));
  } else if (!isSurf && !isClimb && !isDive && !spot.era5_local_wind && era && era.rose && era.rose.some((x) => x > 0)) {
    const roseHost = h('div', { class: 'rose-host' });
    const sec = section(t(isFly ? 'sec.rose_pg' : 'sec.rose', { in_month: MONTHS_IN[month - 1] }), roseHost);
    body.append(sec);
    const share = windRose(roseHost, era.rose);
    roseHost.append(h('p', { class: 'source' }, isFly ? t('card.rose_note_pg', { p: share, period: spot.climate_periods.era5 })
      : t('card.rose_note', { v: windText(12), p: share, period: spot.climate_periods.era5 })));
  }

  const fcHost = oldForecast || h('div', { class: 'fc-host', 'data-unit': getUnit() });
  body.append(section(isDive ? t('sec.forecast_dive') : isFly ? t('sec.forecast_pg') : isClimb ? t('sec.forecast_climb') : isMtn ? t('sec.forecast_snow') : isSurf ? t('sec.forecast_surf') : t('sec.forecast'), fcHost));
  if (!oldForecast) (isDive ? renderSeaForecast : isFly ? renderParaForecast : isClimb ? renderClimbForecast : isMtn ? renderSnowForecast : isSurf ? renderSurfForecast : renderForecast)(fcHost, spot);

  body.append(section(t('sec.video'), oldVideos || renderVideos(spot)));  // keep a playing video alive

  const schools = h('div', {},
    h('p', {}, SCHOOLS[spot.schools] || t('card.schools_unknown'),
      !isRu ? '.' : spot.ru_schools === 'yes' ? t('card.schools_ru_yes') : spot.ru_schools === 'no' ? t('card.schools_ru_no') : '.'));
  if (spot.school_list.length) {
    // schools that confirmed their listing first, then Russian-speaking ones (the list itself stays in seed order:
    // translated notes are matched to it by position)
    const list = [...spot.school_list].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || (b.ru || 0) - (a.ru || 0));
    schools.append(h('ul', { class: 'schools' }, ...list.map((sc) => schoolItem(sc))));
  }
  schools.append(h('p', { class: 'sc-fix' },
    h('button', { type: 'button', onclick: (e) => { track('school_fix'); openAbout(e.currentTarget, 'school'); } }, t('card.school_fix'))));
  body.append(section(t('sec.schools'), schools));

  if ((spot.pros || []).length || (spot.cons || []).length || spot.hazards) {
    body.append(section(t('sec.proscons'),
      h('div', { class: 'proscons' },
        (spot.pros || []).length ? h('div', {}, h('h4', { class: 'visually-hidden' }, t('card.pros')), h('ul', { class: 'pros' }, ...spot.pros.map((x) => h('li', {}, x)))) : null,
        (spot.cons || []).length ? h('div', {}, h('h4', { class: 'visually-hidden' }, t('card.cons')), h('ul', { class: 'cons' }, ...spot.cons.map((x) => h('li', {}, x)))) : null),
      spot.hazards ? h('p', { class: 'hazards' }, h('b', {}, t('card.hazards')), spot.hazards) : null));
  }

  const v = spot.visa;
  if (hasPassport()) {
    // Russian passport: hand-checked rules (their labels and notes are written in Russian, shown in the Russian interface);
    // other passports: the Passport Index table
    const ru = isRuPassport();
    const detailed = ru && isRu;
    const tableDate = visaTableDate();
    let monthYear = tableDate || '';
    try { if (tableDate) monthYear = new Date(tableDate).toLocaleDateString(lang, { month: 'long', year: 'numeric' }); } catch { /* keep the raw date */ }
    body.append(section(t('sec.visa'),
      h('dl', { class: 'facts' },
        fact(ru ? t('card.visa_ru') : t('card.visa_for', { country: countryName(passport, passport) }), visaChip(v, detailed),
          v && v.stay_days && !(detailed && /\d+\s*(дн|сут)/.test(v.label || '')) ? h('small', {}, ` ${tn('n.days', v.stay_days)}`) : null),
        detailed && v && v.notes ? fact(t('card.visa_notes'), v.notes) : null,
        fact(t('card.airport'), spot.airport || '—')),
      ru ? (v && (v.source || v.checked) ? h('p', { class: 'source' }, t('card.visa_checked', { d: v.checked || '' }),
        v.source ? h('a', { href: v.source, target: '_blank', rel: 'noopener' }, t('card.source')) : null, t('card.visa_consulate')) : null)
        : h('p', { class: 'source' }, t('card.visa_table', { d: monthYear }),
          h('a', { href: 'https://www.passportindex.org/', target: '_blank', rel: 'noopener' }, 'Passport Index'), t('card.visa_consulate'))));
  } else if (spot.airport) {
    body.append(section(t('sec.airport'), h('dl', { class: 'facts' }, fact(t('card.airport'), spot.airport))));
  }

  const related = nearbyBlock(spot, month, ctx);
  if (related) body.append(section(t('sec.nearby'), related));

  const links = spot.links || {};
  const linkList = h('ul', { class: 'links' },
    links.official ? h('li', {}, h('a', { href: links.official, target: '_blank', rel: 'noopener' }, isClimb || isFly ? t('card.link_official_area') : t('card.link_official'))) : null,
    links.paraglidingearth ? h('li', {}, h('a', { href: links.paraglidingearth, target: '_blank', rel: 'noopener' }, 'Paragliding Earth')) : null,
    links.xcontest ? h('li', {}, h('a', { href: links.xcontest, target: '_blank', rel: 'noopener' }, 'XContest')) : null,
    links.thecrag ? h('li', {}, h('a', { href: links.thecrag, target: '_blank', rel: 'noopener' }, 'theCrag')) : null,
    links['27crags'] ? h('li', {}, h('a', { href: links['27crags'], target: '_blank', rel: 'noopener' }, '27 Crags')) : null,
    links.mountainproject ? h('li', {}, h('a', { href: links.mountainproject, target: '_blank', rel: 'noopener' }, 'Mountain Project')) : null,
    links.skiresort_info ? h('li', {}, h('a', { href: links.skiresort_info, target: '_blank', rel: 'noopener' }, 'Skiresort.info')) : null,
    links.surf_forecast ? h('li', {}, h('a', { href: links.surf_forecast, target: '_blank', rel: 'noopener' }, 'Surf-Forecast')) : null,
    links.surfline ? h('li', {}, h('a', { href: links.surfline, target: '_blank', rel: 'noopener' }, 'Surfline')) : null,
    links.windguru ? h('li', {}, h('a', { href: links.windguru, target: '_blank', rel: 'noopener' }, t('card.link_windguru'))) : null,
    links.windfinder ? h('li', {}, h('a', { href: links.windfinder, target: '_blank', rel: 'noopener' }, t('card.link_windfinder'))) : null,
    h('li', {}, h('a', { href: isClimb ? `https://www.windy.com/-Rain-thunder-rain?rain,${spot.lat.toFixed(3)},${spot.lng.toFixed(3)},10`
      : isMtn ? `https://www.windy.com/-Snow-depth-snowcover?snowcover,${spot.lat.toFixed(3)},${spot.lng.toFixed(3)},10`
      : isSurf ? `https://www.windy.com/-Waves-waves?waves,${spot.lat.toFixed(3)},${spot.lng.toFixed(3)},9`
        : `https://www.windy.com/${spot.lat.toFixed(3)}/${spot.lng.toFixed(3)}?${spot.lat.toFixed(3)},${spot.lng.toFixed(3)},11`, target: '_blank', rel: 'noopener' },
    isClimb ? t('card.link_windy_rain') : isMtn ? t('card.link_windy_snow') : isSurf ? t('card.link_windy_waves') : t('card.link_windy'))),
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
