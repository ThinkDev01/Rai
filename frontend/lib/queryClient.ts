import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton queryClient - shared between QueryProvider, the axios interceptor,
 * and any non-React code that needs to clear the cache on logout/login.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
