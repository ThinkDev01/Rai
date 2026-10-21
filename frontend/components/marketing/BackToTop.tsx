'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from '@/lib/icons';

/**
 * Floating "back to top" button for long marketing pages.
 *
 * Behavior:
 *   - Hidden by default (off-screen + opacity 0).
 *   - Appears once the user scrolls past 600px (roughly past the hero).
 *   - Smooth-scrolls to top on click; falls back to instant scroll if the
 *     browser doesn't support `behavior: 'smooth'` or the user prefers
 *     reduced motion.
 *   - Sits bottom-right with a fixed offset that clears the marketing
 *     footer's top edge on common breakpoints.
 *
 * Performance:
 *   - One passive scroll listener, no rAF needed — we only flip a boolean.
 *   - Transition is opacity + transform on a single element; cheap.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 600);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className={`fixed bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-subtle shadow-lg transition-all duration-300 hover:border-primary/40 hover:text-primary hover:shadow-xl ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
    >
      <ChevronUp size={18} />
    </button>
  );
}
