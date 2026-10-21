'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// Wraps a scrollable region and shows a soft fade at the top / bottom edge
// when there's more content to scroll in that direction — a quiet "more
// below/above" hint, since the subtle 3px scrollbar only appears on hover.
// The fades are scroll-aware (vanish at each end) and pointer-events-none so
// they never block clicks on the rows beneath.
//
// `className` is applied to the inner scroll container (pass the height cap +
// overflow + scrollbar utilities there). `fadeFrom` is the gradient's solid
// color — set it to the surface the list sits on so the fade reads as the
// content dissolving, not a grey bar (default: surface-raised).

interface ScrollFadeProps {
  className?: string;
  children: React.ReactNode;
  /** Tailwind gradient color-stop matching the list background. */
  fadeFrom?: string;
}

export function ScrollFade({ className, children, fadeFrom = 'from-surface-raised' }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    // 4px slack so a 1px sub-pixel gap doesn't flicker the fade at the ends.
    setShowTop(scrollTop > 4);
    setShowBottom(scrollTop + clientHeight < scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Re-evaluate when the list grows/shrinks (data load, filter, resize).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [update]);

  return (
    <div className="relative">
      <div ref={ref} className={className}>
        {children}
      </div>
      {showTop && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b ${fadeFrom} to-transparent`} />
      )}
      {showBottom && (
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t ${fadeFrom} to-transparent`} />
      )}
    </div>
  );
}
