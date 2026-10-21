import { AlertTriangle, RefreshCw } from '@/lib/icons';

interface PageErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function PageError({ message = 'Something went wrong', onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <p className="text-text-muted text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}
