'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './NeuralNetworkArt.module.css';

const layers = [3, 5, 6, 5, 3];
const neurons = layers.flatMap((count, layer) =>
  Array.from({ length: count }, (_, row) => ({
    layer,
    x: (layer - 2) * 92,
    y: (row - (count - 1) / 2) * 47,
    z: Math.sin(row * 2.4 + layer * 1.7) * 42,
  })),
);
const connections = neurons.flatMap((node, from) =>
  neurons.flatMap((next, to) => next.layer === node.layer + 1 ? [{ from, to }] : []),
);

/** Decorative hero artwork. Native page scrolling turns the network in depth. */
export function NeuralNetworkArt({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element || reducedMotion.matches) {
        setProgress(0);
        return;
      }
      const bounds = element.getBoundingClientRect();
      // Start from the artwork's resting position and turn as it leaves the viewport.
      const top = bounds.top + window.scrollY;
      setProgress(Math.min(1, Math.max(0, window.scrollY / (top + bounds.height))));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reducedMotion.addEventListener('change', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reducedMotion.removeEventListener('change', schedule);
    };
  }, []);

  const angle = progress * 1.1 - 0.12;
  const points = neurons.map(({ x, y, z }) => {
    const depth = x * Math.sin(angle) + z * Math.cos(angle);
    const scale = 640 / (640 + depth);
    return {
      x: 280 + (x * Math.cos(angle) - z * Math.sin(angle)) * scale,
      y: 210 + (y + Math.sin(progress * Math.PI) * x * 0.12) * scale,
      scale,
    };
  });

  return (
    <svg ref={ref} viewBox="0 0 560 420" className={`${styles.network} ${className ?? ''}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0" stopColor="#efe2cf" stopOpacity=".9" />
          <stop offset="1" stopColor="#f8f3ea" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="280" cy="210" rx="275" ry="205" fill={`url(#${gradientId})`} />
      <g fill="none" className="stroke-brown-300" strokeOpacity=".3">
        <ellipse cx="280" cy="210" rx="246" ry="165" />
        <ellipse cx="280" cy="210" rx="246" ry="112" transform={`rotate(${-18 + progress * 35} 280 210)`} />
      </g>
      <g fill="none" strokeWidth="1">
        {connections.map(({ from, to }, index) => {
          const a = points[from];
          const b = points[to];
          return (
            <g key={`${from}-${to}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-brown-400" strokeOpacity=".24" />
              {index % 3 === 0 && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength="100" className={`${styles.signal} stroke-amber`} style={{ animationDelay: `${-(index % 11) * 0.43}s` }} />
              )}
            </g>
          );
        })}
      </g>
      {points.map(({ x, y, scale }, index) => (
        <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
          <circle r="12" className={`${styles.halo} fill-brown-200`} style={{ animationDelay: `${-index * 0.31}s` }} />
          <circle r="5" className={neurons[index].layer === 2 ? 'fill-brown-700' : 'fill-brown-500'} />
          <circle cx="-1.3" cy="-1.4" r="1.4" className="fill-brown-50" fillOpacity=".8" />
        </g>
      ))}
    </svg>
  );
}
