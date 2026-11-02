// Map marker: a straight triangular pennant on a pole — the same shape for every season,
// only the colour changes. Drawn in a 34×46 box; the pole stands at x = 9 from y = 4 to y = 42
// (the anchor point is the bottom of the pole).

export const FLAG_COLORS = {
  peak: '#79c99a',      // pastel mint — great season
  shoulder: '#f3d36b',  // pastel butter — shoulder season
  snow: '#ffffff',      // white (+ snowflake) — snowkite season
  off: '#ee9a90',       // pastel coral — no season
};
export const FLAG_INK = '#2c4a59';
export const CLOTH = 'M10 3.5 L31 12 L10 20.5 Z';
const SNOW = 'M16.8 8.6v6.8M13.9 10.3l5.8 3.4M13.9 13.7l5.8-3.4';

export function flagSVG(kind) {
  const fill = FLAG_COLORS[kind] || FLAG_COLORS.peak;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 46">`
    + `<path d="M9 4v38" stroke="${FLAG_INK}" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="${CLOTH}" fill="${fill}" stroke="${FLAG_INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + (kind === 'snow' ? `<path d="${SNOW}" stroke="#2b7bb0" stroke-width="1.3" stroke-linecap="round"/>` : '')
    + `<circle cx="9" cy="42" r="2.4" fill="${FLAG_INK}"/></svg>`;
}

/** Canvas version for MapLibre (sprite-free): same shape, 2× pixel ratio. */
export function flagImage(kind) {
  const s = 2, W = 34, H = 46;
  const c = document.createElement('canvas');
  c.width = W * s; c.height = H * s;
  const g = c.getContext('2d');
  g.scale(s, s);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = 'rgba(18,48,63,0.20)';
  g.beginPath(); g.ellipse(9, 43, 5, 1.8, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(9, 4); g.lineTo(9, 42); g.stroke();
  g.strokeStyle = FLAG_INK; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(9, 4); g.lineTo(9, 42); g.stroke();
  const cloth = new Path2D(CLOTH);
  g.fillStyle = FLAG_COLORS[kind] || FLAG_COLORS.peak; g.fill(cloth);
  g.strokeStyle = FLAG_INK; g.lineWidth = 1.5; g.stroke(cloth);
  if (kind === 'snow') { g.strokeStyle = '#2b7bb0'; g.lineWidth = 1.3; g.stroke(new Path2D(SNOW)); }
  g.fillStyle = FLAG_INK; g.strokeStyle = '#fff'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(9, 42, 2.4, 0, Math.PI * 2); g.fill(); g.stroke();
  return { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

/** CSS for the small flag icons in the panel (.flag-peak etc.), generated from the same shape. */
export function injectFlagCSS() {
  const css = Object.keys(FLAG_COLORS)
    .map((k) => `.flag-${k}{background-image:url("data:image/svg+xml,${encodeURIComponent(flagSVG(k))}")}`)
    .join('\n');
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
}
