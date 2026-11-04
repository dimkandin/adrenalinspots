// A guess that the visitor is in Russia (used to order the donation options).
const RU_ZONES = /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Saratov|Ulyanovsk|Astrakhan|Kirov|Simferopol)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr))$/;
/** The visitor is probably in Russia: the device clock is in a Russian time zone, or map tiles were blocked this week. */
export function inRussia() {
  try { if (RU_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) return true; } catch { /* old browser */ }
  try { const v = Number(localStorage.getItem('basemapFail')); if (v && Date.now() - v < 7 * 864e5) return true; } catch { /* no storage */ }
  return false;
}
