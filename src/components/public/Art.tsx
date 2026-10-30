import type { IconName } from '@/lib/public/copy';

/** Decorative inline SVG (no external images). All aria-hidden: meaning is always carried by adjacent text. */
export function HeroArt({ className }: { className?: string }) {
  const nodes: [number, number, number][] = [[120, 250, 7], [210, 170, 9], [300, 230, 6], [360, 120, 10], [450, 190, 7], [270, 90, 5], [180, 330, 5], [400, 300, 8]];
  const links = [[0, 1], [1, 2], [1, 5], [5, 3], [3, 4], [2, 4], [2, 7], [0, 6], [6, 2], [4, 7]];
  return (
    <svg viewBox="0 0 560 420" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ha-glow" cx="62%" cy="38%" r="55%"><stop offset="0" stopColor="#efe2cf" /><stop offset="1" stopColor="#f8f3ea" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="560" height="420" rx="28" fill="url(#ha-glow)" />
      <g fill="none" className="stroke-brown-300" strokeOpacity=".55">
        {[60, 100, 140, 180, 220].map((r) => <ellipse key={r} cx="340" cy="170" rx={r * 1.25} ry={r} />)}
      </g>
      <g fill="none" className="stroke-brown-400" strokeWidth="1.5" strokeOpacity=".7">
        {links.map(([a, b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />)}
      </g>
      {nodes.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r + 7} className="fill-brown-100" fillOpacity=".8" />
          <circle cx={x} cy={y} r={r} className={i === 3 ? 'fill-brown-700' : 'fill-brown-500'} />
        </g>
      ))}
      <path d="M360 76 l4 -16 l4 16 l16 4 l-16 4 l-4 16 l-4 -16 l-16 -4 z" className="fill-amber" fillOpacity=".85" />
    </svg>
  );
}

const ICONS: Record<IconName, React.ReactNode> = {
  decision: <><path d="M5 4v6a4 4 0 0 0 4 4h6" /><path d="M19 4v4" /><circle cx="5" cy="4" r="1.6" /><circle cx="19" cy="4" r="1.6" /><path d="M15 11l3 3-3 3" /><path d="M5 14v6" /></>,
  document: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 12h5M10 15h5M10 18h3" /></>,
  agent: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="12" rx="4" ry="9" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /><path d="M7 9l4-3 4 2 4-4" /></>,
  config: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
};

export function CapIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

/** Small abstract illustration per product, in the brown palette. */
export function ProductArt({ slug, className }: { slug: string; className?: string }) {
  const frame = <rect x="1" y="1" width="318" height="158" rx="14" className="fill-brown-50 stroke-brown-200" />;
  let art: React.ReactNode;
  switch (slug) {
    case 'credit-strategy-simulator':
      art = <><g className="stroke-brown-300" strokeWidth="1"><line x1="40" y1="120" x2="280" y2="120" /><line x1="40" y1="80" x2="280" y2="80" strokeDasharray="3 5" /><line x1="40" y1="40" x2="280" y2="40" strokeDasharray="3 5" /></g><path d="M40 112 C90 100 120 60 160 70 S230 110 280 48" fill="none" className="stroke-brown-700" strokeWidth="3" strokeLinecap="round" /><path d="M40 118 C100 112 130 96 170 92 S240 80 280 78" fill="none" className="stroke-brown-400" strokeWidth="2" strokeDasharray="5 5" /><circle cx="160" cy="70" r="6" className="fill-amber" /></>;
      break;
    case 'sme-credit-decisioning':
      art = <><rect x="50" y="28" width="104" height="104" rx="8" className="fill-card stroke-brown-300" /><g className="stroke-brown-300" strokeWidth="3" strokeLinecap="round"><line x1="64" y1="52" x2="132" y2="52" /><line x1="64" y1="72" x2="120" y2="72" /><line x1="64" y1="92" x2="128" y2="92" /></g><rect x="176" y="40" width="94" height="30" rx="8" className="fill-brown-700" /><rect x="176" y="82" width="94" height="30" rx="8" className="fill-brown-200" /><path d="M192 55l6 6 11-12" fill="none" stroke="#fffaf1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>;
      break;
    case 'similar-portfolio-intelligence':
      art = <><circle cx="160" cy="80" r="52" className="fill-brown-100 stroke-brown-300" strokeDasharray="4 4" />{[[120, 60], [140, 98], [172, 56], [190, 92], [160, 80], [210, 40], [80, 110], [250, 120], [60, 50]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 8 : 5} className={i === 4 ? 'fill-brown-700' : i < 4 ? 'fill-brown-500' : 'fill-brown-300'} />)}</>;
      break;
    case 'riva':
      art = <><g className="fill-card stroke-brown-300"><rect x="40" y="36" width="90" height="88" rx="8" /><rect x="190" y="36" width="90" height="88" rx="8" /></g><g className="stroke-brown-400" strokeWidth="2" fill="none"><path d="M130 56 C160 56 160 76 190 76" /><path d="M130 80 C160 80 160 100 190 100" /><path d="M130 104 C160 104 160 56 190 56" /></g><g className="fill-brown-600">{[56, 80, 104].map((y) => <circle key={y} cx="130" cy={y} r="4" />)}{[56, 76, 100].map((y) => <circle key={y} cx="190" cy={y} r="4" />)}</g></>;
      break;
    default:
      art = <circle cx="160" cy="80" r="40" className="fill-brown-200" />;
  }
  return <svg viewBox="0 0 320 160" className={className} aria-hidden="true" focusable="false">{frame}{art}</svg>;
}

export function TrustMark({ n, className }: { n: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" className="fill-brown-50 stroke-brown-300" />
      <text x="24" y="29" textAnchor="middle" className="fill-brown-700" style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 600 }}>{n}</text>
    </svg>
  );
}
