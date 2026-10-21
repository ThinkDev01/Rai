'use client';

import { Pin } from '@/lib/icons';

/**
 * Small pin toggle used in lists where the row is itself a link (projects
 * index, My Work). Stops click propagation so pinning never triggers the row's
 * navigation. Filled + primary-tinted when pinned, ghosted otherwise.
 */
export function PinButton({
  pinned,
  onToggle,
  disabled = false,
  size = 14,
  className = '',
}: {
  pinned: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      title={pinned ? 'Unpin' : 'Pin'}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
        pinned
          ? 'border-primary/40 bg-primary-subtle text-primary'
          : 'border-transparent text-text-placeholder hover:border-border hover:bg-surface hover:text-text'
      } ${className}`}
    >
      <Pin size={size} className={pinned ? 'fill-current' : ''} />
    </button>
  );
}
