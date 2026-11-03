// Visitor statistics: Yandex Metrika and Google Analytics 4.
// Counter ids are public by design (every site shows them in its page code), so they live here.
// Nothing is loaded on localhost / the home network: testing the site never counts as visits.
const YM_ID = 114059917;          // Yandex Metrika counter «Adrenalin Spots»
const GA_ID = 'G-CELEFVV50Z';     // Google Analytics 4, web stream «Adrenalin Spots»

const LOCAL = /^(localhost|127\.|192\.168\.|10\.|\[::1\]|[^.]+$)/.test(location.hostname);
let started = false;

function loadScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.append(s);
}

export function initAnalytics() {
  if (LOCAL || started) return;
  started = true;
  if (YM_ID) {
    // the official Metrika loader: queue calls until tag.js arrives
    window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };   // eslint-disable-line prefer-rest-params
    window.ym.l = Date.now();
    loadScript(`https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}`);
    window.ym(YM_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, trackHash: true });
  }
  if (GA_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };   // gtag needs `arguments`
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  }
}

/** A "page" inside the app (a spot card, a sport section): counted as a page view with its own address. */
export function trackView(title) {
  if (LOCAL || !started) return;
  const url = location.href;
  try {
    if (YM_ID && window.ym) window.ym(YM_ID, 'hit', url, { title });
    if (GA_ID && window.gtag) window.gtag('event', 'page_view', { page_location: url, page_title: title });
  } catch { /* statistics must never break the site */ }
}

/** A user action: opening a spot, switching the sport… (Metrika goal + GA4 event with the same name). */
export function track(name, params = {}) {
  if (LOCAL || !started) return;
  try {
    if (YM_ID && window.ym) window.ym(YM_ID, 'reachGoal', name, params);
    if (GA_ID && window.gtag) window.gtag('event', name, params);
  } catch { /* ignore */ }
}
