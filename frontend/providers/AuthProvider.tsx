'use client';

import '@/lib/cognito-client';  // side-effect: runs auth-storage-guard on boot

// Thin pass-through wrapper. The side-effect import above ensures cognito-client's
// module init (which runs the storage guard) executes before any page renders —
// so stale auth state from a prior pool/client is cleaned before user interaction.
// Future: an auth context provider can land here without rewiring layout.

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
