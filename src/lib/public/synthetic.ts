/** Synthetic demo "video" assets: animated + static SVG generated from text. No external media, no real footage. */
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const frame = (title: string, subtitle: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e3324"/><stop offset="1" stop-color="#7f5636"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#g)"/>
<g fill="none" stroke="#e2cdb0" stroke-opacity=".12">${[60, 110, 160, 210].map((r) => `<circle cx="540" cy="70" r="${r}"/>`).join('')}</g>
${body}
<text x="32" y="58" fill="#efe2cf" font-family="Georgia,serif" font-size="26">${esc(title)}</text>
<text x="32" y="84" fill="#cfae8a" font-family="sans-serif" font-size="13" letter-spacing="2">${esc(subtitle.toUpperCase())}</text>
<rect x="32" y="318" width="236" height="24" rx="12" fill="#2f2118" fill-opacity=".55"/>
<text x="44" y="334" fill="#efe2cf" font-family="sans-serif" font-size="11">SYNTHETIC DEMO - no real product footage</text>
</svg>`;

/** Looping animated bar/line "dashboard walkthrough". */
export function demoVideoSvg(title: string, subtitle: string): string {
  const bars = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const x = 64 + i * 56;
    const hs = [60, 120, 90, 150, 80, 130, 100];
    const h = hs[i];
    return `<rect x="${x}" width="36" rx="4" fill="#e2cdb0" fill-opacity="${0.45 + (i % 3) * 0.18}"><animate attributeName="height" values="${h};${h + 50};${Math.max(30, h - 30)};${h}" dur="${3 + i * 0.4}s" repeatCount="indefinite"/><animate attributeName="y" values="${290 - h};${290 - h - 50};${290 - Math.max(30, h - 30)};${290 - h}" dur="${3 + i * 0.4}s" repeatCount="indefinite"/></rect>`;
  }).join('');
  const dot = `<circle r="7" fill="#fffaf1"><animateMotion dur="6s" repeatCount="indefinite" path="M64,230 C150,150 230,250 320,180 S 480,120 560,160"/></circle><path d="M64,230 C150,150 230,250 320,180 S 480,120 560,160" fill="none" stroke="#fffaf1" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 6"/>`;
  return frame(title, subtitle, `<line x1="48" y1="290" x2="600" y2="290" stroke="#e2cdb0" stroke-opacity=".4"/>${bars}${dot}`);
}

/** Static poster with a play glyph. */
export function demoPosterSvg(title: string, subtitle: string): string {
  return frame(title, subtitle, `<circle cx="320" cy="190" r="46" fill="#fffaf1" fill-opacity=".92"/><path d="M308 166 L346 190 L308 214 Z" fill="#654229"/>`);
}
