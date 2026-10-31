'use client';

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
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

/** Scroll, drag, or use the arrow keys to explore the network. */
export function NeuralNetworkArt({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [progress, setProgress] = useState(0);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; rotation: typeof rotation } | null>(null);
  const prefersReducedMotion = useRef(false);
  const active = hovered ?? selected;
  const toggleNode = (index: number) => setSelected((current) => current === index ? null : index);

  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (drag.current?.id === event.pointerId) {
      setRotation({
        x: Math.max(-1.1, Math.min(1.1, drag.current.rotation.x + (event.clientY - drag.current.y) / bounds.height * 2)),
        y: Math.max(-1.1, Math.min(1.1, drag.current.rotation.y + (event.clientX - drag.current.x) / bounds.width * 3)),
      });
    } else if (event.pointerType === 'mouse' && !prefersReducedMotion.current) {
      setPointer({ x: (event.clientY - bounds.top) / bounds.height - 0.5, y: (event.clientX - bounds.left) / bounds.width - 0.5 });
    }
  };
  const stopDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      prefersReducedMotion.current = reducedMotion.matches;
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

  const angle = progress * 1.1 - 0.12 + rotation.y + pointer.y * 0.25;
  const tilt = rotation.x + pointer.x * 0.2;
  const points = neurons.map(({ x, y, z }) => {
    const depth = x * Math.sin(angle) + z * Math.cos(angle);
    const scale = 640 / (640 + depth * Math.cos(tilt) + y * Math.sin(tilt));
    return {
      x: 280 + (x * Math.cos(angle) - z * Math.sin(angle)) * scale,
      y: 210 + (y * Math.cos(tilt) - depth * Math.sin(tilt) + Math.sin(progress * Math.PI) * x * 0.12) * scale,
      scale,
    };
  });

  return (
    <svg
      ref={ref} viewBox="0 0 560 420" className={`${styles.network} ${dragging ? styles.dragging : ''} ${className ?? ''}`}
      role="group" aria-label="Interactive neural network. Drag or use arrow keys to rotate. Select a neuron to highlight its connections. Escape resets the network."
      tabIndex={0}
      onPointerMove={movePointer}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('[role="button"]')) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation };
        setDragging(true);
        setPointer({ x: 0, y: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
      onPointerLeave={() => { setPointer({ x: 0, y: 0 }); setHovered(null); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setRotation({ x: 0, y: 0 }); setPointer({ x: 0, y: 0 }); setSelected(null); setHovered(null);
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          setRotation((current) => ({
            x: Math.max(-1.1, Math.min(1.1, current.x + (event.key === 'ArrowUp' ? -0.1 : event.key === 'ArrowDown' ? 0.1 : 0))),
            y: Math.max(-1.1, Math.min(1.1, current.y + (event.key === 'ArrowLeft' ? -0.1 : event.key === 'ArrowRight' ? 0.1 : 0))),
          }));
        }
      }}
    >
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
          const connected = active === from || active === to;
          return (
            <g key={`${from}-${to}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={connected ? 'stroke-amber' : 'stroke-brown-400'} strokeOpacity={connected ? .9 : active === null ? .24 : .08} strokeWidth={connected ? 2 : 1} />
              {(active === null ? index % 3 === 0 : connected) && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength="100" className={`${styles.signal} stroke-amber`} style={{ animationDelay: `${-(index % 11) * 0.43}s` }} />
              )}
            </g>
          );
        })}
      </g>
      {points.map(({ x, y, scale }, index) => (
        <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}
          className={styles.neuron} role="button" tabIndex={0}
          aria-label={`Layer ${neurons[index].layer + 1}, neuron ${index + 1}`} aria-pressed={selected === index}
          onPointerEnter={() => setHovered(index)} onPointerLeave={() => setHovered(null)}
          onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}
          onClick={() => toggleNode(index)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleNode(index); }
          }}
        >
          <circle r="17" fill="transparent" />
          <circle r="15" fill="none" className={`${styles.selection} stroke-amber`} opacity={active === index ? 1 : 0} strokeWidth="1.5" />
          <circle r="12" className={`${styles.halo} fill-brown-200`} style={{ animationDelay: `${-index * 0.31}s` }} />
          <circle r={active === index ? 7 : 5} className={active === index ? 'fill-amber' : neurons[index].layer === 2 ? 'fill-brown-700' : 'fill-brown-500'} />
          <circle cx="-1.3" cy="-1.4" r="1.4" className="fill-brown-50" fillOpacity=".8" />
        </g>
      ))}
      <text x="280" y="402" textAnchor="middle" className="fill-muted" fontSize="11" aria-hidden="true">Drag to rotate · Select a neuron · Scroll to explore</text>
    </svg>
  );
}
