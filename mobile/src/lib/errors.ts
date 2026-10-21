import axios from 'axios';

/** Extract a human-friendly message from an axios/API error. */
export function extractApiError(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
