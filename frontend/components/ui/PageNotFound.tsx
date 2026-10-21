import Link from 'next/link';
import { FileQuestion } from '@/lib/icons';

interface PageNotFoundProps {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}

export function PageNotFound({
  title   = '404 - Not Found',
  message = "This page doesn't exist or was removed.",
  backHref  = '/dashboard',
  backLabel = 'Back to dashboard',
}: PageNotFoundProps) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5 text-center px-6">
      {/* Icon block */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface">
        <FileQuestion className="h-9 w-9 text-text-placeholder" />
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-semibold text-text">{title}</p>
        <p className="text-sm text-text-subtle max-w-xs">{message}</p>
      </div>

      {/* Back link */}
      <Link
        href={backHref}
        className="rounded bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        {backLabel}
      </Link>
    </div>
  );
}
