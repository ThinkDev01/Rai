'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from '@/lib/icons';
import { logger } from '@/lib/logger';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error tracking service when available
    logger.error('AppError', 'Route error boundary caught an error', {
      error: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-text">Something went wrong</p>
        <p className="text-sm text-text-subtle max-w-xs">
          An unexpected error occurred. Try refreshing the page.
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
