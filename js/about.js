// «О проекте»: who made the map, how to reach him and how to support it.
// Instagram belongs to Meta, which is banned as «extremist» in Russia, so visitors who seem to be there
// (Russian time zone, or map tiles blocked lately) see neither its link nor its name.
import { track } from './analytics.js';
import { t } from './i18n.js';
import { h } from './util.js';

export const CONTACT = { handle: 'dim_kandin', telegram: 'https://t.me/dim_kandin', instagram: 'https://www.instagram.com/dim_kandin/' };

// Ways to support the project; an empty value hides the option.
export const DONATE = {
  ru: '',                              // card or SBP from Russia (a CloudTips / YooMoney / Boosty page)
  paypal: '',                          // https://paypal.me/…
  platform: { name: '', url: '' },     // a donation platform paying out to a foreign card
  usdt: [{ net: 'TRON (TRC-20)', address: 'TFyvfZpSut7Q4xiYrpLqjcuFFmXfc4AtLz', qr: '/img/usdt-trc20.svg' }],
};

const RU_ZONES = /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Saratov|Ulyanovsk|Astrakhan|Kirov|Simferopol)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr))$/;
/** The visitor is probably in Russia: the device clock is in a Russian time zone, or map tiles were blocked this week. */
export function inRussia() {
  try { if (RU_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) return true; } catch { /* old browser */ }
  try { const v = Number(localStorage.getItem('basemapFail')); if (v && Date.now() - v < 7 * 864e5) return true; } catch { /* no storage */ }
  return false;
}

const ICON = {
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.5 0 1.8l4.6 1.4 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.4 4.8 3.5c.6.4 1.4.1 1.6-.6l3.2-15.3c.2-1-.8-1.8-1.6-1.5ZM9.6 14.3l8.2-6.6-6.7 7.4-.3 2.9z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.9-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 3.6c-2.3 0-2.6 0-3.5.1-3 .1-4.7 1.8-4.8 4.8-.1.9-.1 1.2-.1 3.5s0 2.6.1 3.5c.1 3 1.8 4.7 4.8 4.8.9.1 1.2.1 3.5.1s2.6 0 3.5-.1c3-.1 4.7-1.8 4.8-4.8.1-.9.1-1.2.1-3.5s0-2.6-.1-3.5c-.1-3-1.8-4.7-4.8-4.8-.9-.1-1.2-.1-3.5-.1Zm0 1.5c2.2 0 2.5 0 3.4.1 2.2.1 3.3 1.2 3.4 3.4.1.9.1 1.2.1 3.4s0 2.5-.1 3.4c-.1 2.2-1.2 3.3-3.4 3.4-.9.1-1.2.1-3.4.1s-2.5 0-3.4-.1c-2.2-.1-3.3-1.2-3.4-3.4-.1-.9-.1-1.2-.1-3.4s0-2.5.1-3.4c.1-2.2 1.2-3.3 3.4-3.4.9-.1 1.2-.1 3.4-.1Z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 0 1 6.8 6.8z"/></svg>',
};

let box = null;
let opener = null;

function close() {
  if (!box) return;
  box.remove(); box = null;
  document.removeEventListener('keydown', onKey, true);
  opener?.focus();
}
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
}

function link(cls, href, icon, text, event) {
  return h('a', { class: `about-link ${cls}`, href, target: '_blank', rel: 'noopener', onclick: () => track(event) },
    icon ? h('span', { class: 'about-ico', html: icon }) : null, text);
}

function usdtBlock(w) {
  const addr = h('code', { class: 'about-addr' }, w.address);
  const copy = h('button', { type: 'button', class: 'about-copy' }, t('about.copy'));
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(w.address); } catch {
      const r = document.createRange(); r.selectNodeContents(addr); getSelection().removeAllRanges(); getSelection().addRange(r);
      try { document.execCommand('copy'); } catch { /* the address stays selected for a manual copy */ }
    }
    copy.textContent = t('about.copied'); setTimeout(() => { copy.textContent = t('about.copy'); }, 2000);
    track('donate_copy_usdt');
  });
  return h('div', { class: 'about-usdt' },
    w.qr ? h('img', { class: 'about-qr', src: w.qr, alt: t('about.qr_alt'), width: 104, height: 104 }) : null,
    h('div', { class: 'about-usdt-main' },
      h('p', { class: 'about-usdt-head' }, 'USDT', h('span', { class: 'about-net' }, w.net)),
      addr,
      h('div', { class: 'about-usdt-foot' }, copy, h('span', { class: 'about-warn' }, t('about.usdt_warn', { net: w.net })))));
}

/** Open the «О проекте» window. */
export function openAbout(from) {
  if (box) return;
  opener = from || document.activeElement;
  const ru = inRussia();
  const channels = ru ? 'Telegram' : 'Telegram, Instagram';
  const donate = [
    DONATE.ru ? link('about-pay', DONATE.ru, null, t('about.pay_ru'), 'donate_ru') : null,
    DONATE.paypal ? link('about-pay', DONATE.paypal, null, 'PayPal', 'donate_paypal') : null,
    DONATE.platform.url ? link('about-pay', DONATE.platform.url, null, DONATE.platform.name, 'donate_platform') : null,
  ].filter(Boolean);
  // from Russia the Russian card option goes first, PayPal last (it doesn't work there)
  if (ru && DONATE.paypal) donate.push(donate.splice(donate.findIndex((a) => a.textContent === 'PayPal'), 1)[0]);
  const hasDonate = donate.length || DONATE.usdt.length;

  const card = h('div', { class: 'picker-card about-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title' },
    h('button', { type: 'button', class: 'about-close', 'aria-label': t('about.close'), onclick: close }, '×'),
    h('h2', { id: 'about-title' }, t('about.title')),
    h('p', { class: 'picker-sub' }, t('about.text')),
    h('h3', {}, t('about.ride_head')),
    h('p', { class: 'about-p' }, t('about.ride', { handle: `@${CONTACT.handle}`, channels })),
    h('div', { class: 'about-links' },
      link('about-tg', CONTACT.telegram, ICON.telegram, `@${CONTACT.handle}`, 'contact_telegram'),
      ru ? null : link('about-ig', CONTACT.instagram, ICON.instagram, `@${CONTACT.handle}`, 'contact_instagram')),
    hasDonate ? h('h3', {}, h('span', { class: 'about-ico heart', html: ICON.heart }), t('about.donate_head')) : null,
    hasDonate ? h('p', { class: 'about-p' }, t('about.donate')) : null,
    donate.length ? h('div', { class: 'about-links' }, ...donate) : null,
    ...DONATE.usdt.map(usdtBlock),
    h('p', { class: 'about-fix' }, t('about.fix')));
  box = h('div', { class: 'picker about' }, card);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box);
  document.addEventListener('keydown', onKey, true);
  card.querySelector('.about-close').focus();
  track('open_about');
}

/** The line under the spot list and the ⓘ button in the header. */
export function aboutTeaser() {
  return h('li', { class: 'about-teaser' },
    h('button', { type: 'button', onclick: (e) => openAbout(e.currentTarget) }, t('about.teaser', { handle: `@${CONTACT.handle}` })));
}
