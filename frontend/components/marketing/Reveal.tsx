'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Delay in ms applied via inline transition-delay (stagger groups of cards). */
  delayMs?: number;
  /** Once visible, stay visible. Default true — matches what users expect from
   *  a marketing site (no re-running on scroll-up). */
  once?: boolean;
}

/**
 * Scroll-triggered fade-up wrapper.
 *
 * Uses a single IntersectionObserver per element (cheap). When the section
 * enters the viewport, we add `.is-visible` to the wrapper, which the CSS
 * `.reveal` class transitions opacity + transform on.
 *
 * Reduced-motion users get the static layout via the @media query in
 * globals.css — no JS gating needed.
 */
export function Reveal({ children, className = '', delayMs = 0, once = true }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // SSR safety + browsers without IO get the visible state immediately so
    // content is never trapped behind a missing API.
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible');
            if (once) observer.unobserve(el);
          } else if (!once) {
            el.classList.remove('is-visible');
          }
        }
      },
      // Trigger a bit before the section is fully in view — feels more
      // responsive than the default 0 threshold.
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
