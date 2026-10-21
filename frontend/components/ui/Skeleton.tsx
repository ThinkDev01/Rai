export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-surface-sunken ${className}`} />
  );
}

// ── Common skeleton patterns ───────────────────────────────────────────────────

export function SkeletonText({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-4 ${className}`} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface-raised p-5 shadow-sm ${className}`}>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${className}`}>
      <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
      <Skeleton className="h-4 w-16 flex-shrink-0" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-5 w-14 rounded-full flex-shrink-0" />
    </div>
  );
}

export function SkeletonAvatar({ size = 8 }: { size?: number }) {
  return (
    <div
      className="animate-pulse rounded-full bg-surface-sunken flex-shrink-0"
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    />
  );
}
