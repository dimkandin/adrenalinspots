// Interface language: detection, dictionaries, plurals, number formatting and spot-text overlays.
// Dictionaries live in web/i18n/ui.<lang>.js; translated spot texts in web/i18n/spots.<lang>.json.
// Changing the language reloads the page (every label is built once from the dictionary).

export const LANGS = [
  { code: 'ru', name: 'Русский' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
];
const CODES = LANGS.map((l) => l.code);

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (CODES.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem('lang');
    if (CODES.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  for (const l of navigator.languages || [navigator.language || '']) {
    const code = String(l).slice(0, 2).toLowerCase();
    if (CODES.includes(code)) return code;
    if (['uk', 'be', 'kk', 'ky', 'hy', 'ka', 'az', 'uz', 'tg'].includes(code)) return 'ru';   // neighbours who read Russian
  }
  return 'en';
}

export const lang = detect();
export const isRu = lang === 'ru';
document.documentElement.lang = lang;

const load = async (code) => {
  try { return (await import(`../i18n/ui.${code}.js`)).default; } catch { return null; }
};
const fallback = (await load('en')) || {};
const dict = (lang === 'en' ? fallback : await load(lang)) || fallback;

export function setLang(code) {
  if (!CODES.includes(code) || code === lang) return;
  try { localStorage.setItem('lang', code); } catch { /* ignore */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', code);
  location.replace(url.toString());
}

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

/** Text for a key, with {placeholders} filled in. Falls back to English, then to the key itself. */
export function t(key, vars) {
  const v = dict[key] ?? fallback[key];
  if (v == null) return key;
  return typeof v === 'string' ? fill(v, vars) : v;
}

const rules = new Intl.PluralRules(lang);
/** Plural-aware text: the dictionary entry is {one, few, many, other} with {n} inside. */
export function tn(key, n, vars) {
  const forms = dict[key] ?? fallback[key];
  if (!forms) return `${n} ${key}`;
  const form = forms[rules.select(n)] ?? forms.other ?? forms.many ?? Object.values(forms)[0];
  return fill(form, { n: num(n), ...vars });
}

const nf0 = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfAny = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
/** Locale number: num(4.5) -> "4,5" in Russian, "4.5" in English. */
export const num = (x, digits) => (x == null ? '—' : (digits === 1 ? nf1 : digits === 0 ? nf0 : nfAny).format(x));

const regionNames = (() => { try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch { return null; } })();
export function countryName(cc, fallbackName) {
  if (!cc) return fallbackName || '';
  try { return regionNames ? regionNames.of(cc.toUpperCase()) : fallbackName; } catch { return fallbackName || cc; }
}

const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short' });
export const weekdayShort = (date) => weekday.format(date).replace('.', '');

/** Fill static texts in index.html: data-i18n (text), data-i18n-aria, -title, -placeholder. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
}

// ---------- translated spot texts --------------------------------------------------------
let pack = null;      // spot texts in the interface language
let packEn = null;    // English, for spots not translated into that language yet
async function fetchPack(code) {
  try {
    const r = await fetch(`i18n/spots.${code}.json`);
    return r.ok ? (await r.json()).spots || {} : null;
  } catch { return null; }
}
export async function loadSpotTexts() {
  if (isRu) return null;
  [pack, packEn] = await Promise.all([fetchPack(lang), lang === 'en' ? null : fetchPack('en')]);
  return pack;
}

/** Show a spot (list item or full card) in the interface language. Mutates and returns it. */
export function localizeSpot(s) {
  if (!s || isRu) return s;
  s.alt_names = `${s.name_ru || ''} ${s.country || ''} ${s.region || ''}`;   // Russian names stay searchable
  s.name_ru = s.name || s.name_ru;
  s.country = countryName(s.cc, s.country_en || s.country);
  const tr = (pack && pack[s.id]) || (packEn && packEn[s.id]);
  if (tr) {
    if (tr.region) s.region = tr.region;
    for (const k of ['description', 'rating_basis', 'waves_note', 'hazards', 'gustiness_note', 'crowd_note', 'wind_dir', 'airport']) {
      if (tr[k] && s[k] != null) s[k] = tr[k];
    }
    if (tr.pros && s.pros) s.pros = tr.pros;
    if (tr.cons && s.cons) s.cons = tr.cons;
    if (tr.vibe_note && s.vibe && s.vibe.note) s.vibe.note = tr.vibe_note;
    if (tr.school_notes && s.school_list) s.school_list.forEach((x, i) => { if (tr.school_notes[i]) x.note_ru = tr.school_notes[i]; });
    if (s.attrs) {   // surf and other activity-specific texts
      const map = { area_breaks: 'area_breaks_ru', beginner_months: 'beginner_months_ru', best_wind_dir: 'best_wind_dir', best_swell_dir: 'best_swell_dir', wave_size_m: 'wave_size_m' };
      for (const [k, f] of Object.entries(map)) if (tr[k] && s.attrs[f] != null) s.attrs[f] = tr[k];
    }
  }
  return s;
}
