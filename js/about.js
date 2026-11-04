// «О проекте»: who made the map, how to reach him and how to support it.
// No Instagram or Facebook anywhere on the site: Meta is banned in Russia as «extremist», and showing its logos
// or links can be punished there (КоАП 20.3), so the only contact is Telegram.
import { track } from './analytics.js';
import { t } from './i18n.js';
import { inRussia } from './region.js';
import { h } from './util.js';

export { inRussia };

export const CONTACT = { handle: 'dim_kandin', telegram: 'https://t.me/dim_kandin' };

// Ways to support the project; an empty value hides the option.
export const DONATE = {
  ru: 'https://pay.cloudtips.ru/p/0b6bfbab',   // CloudTips (T-Bank): Russian cards, 49–5 000 ₽, paid out to Dim's Russian card
  paypal: 'https://paypal.me/DmitryKandin',
  // lava.top donations: any amount, Visa / Mastercard / PayPal, paid out to a foreign card (8 %); no sign-up for the donor
  platform: { label: 'about.pay_card', url: 'https://app.lava.top/dim_kandin?tabId=donate' },
  usdt: [{ net: 'TRON (TRC-20)', address: 'TFyvfZpSut7Q4xiYrpLqjcuFFmXfc4AtLz', qr: '/img/usdt-trc20.svg' }],
};


export const ICON = {
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.5 0 1.8l4.6 1.4 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.4 4.8 3.5c.6.4 1.4.1 1.6-.6l3.2-15.3c.2-1-.8-1.8-1.6-1.5ZM9.6 14.3l8.2-6.6-6.7 7.4-.3 2.9z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.3 21.7l4.8-1.3A9.8 9.8 0 1 0 12 2.2Zm0 17.9c-1.5 0-3-.4-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1Zm4.5-6c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.2Z"/></svg>',
  vk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.8 17.5C6.6 17.5 3.1 13.2 3 6.5h3.1c.1 4.9 2.3 7 4 7.4V6.5h2.9v4.2c1.7-.2 3.5-2.1 4.1-4.2H20c-.5 2.6-2.4 4.5-3.8 5.3 1.4.6 3.6 2.4 4.4 5.7h-3.2c-.7-2.2-2.4-3.8-4.6-4.1v4.1h-.3Z"/></svg>',
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
  const channels = 'Telegram';
  const payRu = DONATE.ru ? link('about-pay', DONATE.ru, null, t('about.pay_ru'), 'donate_ru') : null;
  const payPal = DONATE.paypal ? link('about-pay', DONATE.paypal, null, 'PayPal', 'donate_paypal') : null;
  const payPlatform = DONATE.platform.url ? link('about-pay', DONATE.platform.url, null, t(DONATE.platform.label), 'donate_platform') : null;
  // from Russia the Russian card goes first and PayPal last (it doesn't work there); elsewhere the other way round
  const donate = (ru ? [payRu, payPlatform, payPal] : [payPal, payPlatform, payRu]).filter(Boolean);
  const hasDonate = donate.length || DONATE.usdt.length;

  const card = h('div', { class: 'picker-card about-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title' },
    h('button', { type: 'button', class: 'about-close', 'aria-label': t('about.close'), onclick: close }, '×'),
    h('h2', { id: 'about-title' }, t('about.title')),
    h('p', { class: 'picker-sub' }, t('about.text')),
    h('h3', {}, t('about.ride_head')),
    h('p', { class: 'about-p' }, t('about.ride', { handle: `@${CONTACT.handle}`, channels })),
    h('div', { class: 'about-links' },
      link('about-tg', CONTACT.telegram, ICON.telegram, `@${CONTACT.handle}`, 'contact_telegram')),
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
