import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-user persistence of dismissed (un-pinned) domain-peer orgs.
 * Ported from web hooks/useDismissedDomainPeers.ts (localStorage → AsyncStorage).
 * Storage key: rai.dismissedDomainPeers.<userId>
 */
export function useDismissedDomainPeers(userId: string | undefined) {
  const key = userId ? `rai.dismissedDomainPeers.${userId}` : null;
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!key) return;
    AsyncStorage.getItem(key)
      .then(raw => {
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) setDismissed(arr);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, [key]);

  const persist = useCallback(
    (next: string[]) => {
      setDismissed(next);
      if (key) AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
    },
    [key],
  );

  const dismiss = useCallback(
    (ids: string[]) => persist(Array.from(new Set([...dismissed, ...ids]))),
    [dismissed, persist],
  );
  const undismiss = useCallback(
    (id: string) => persist(dismissed.filter(d => d !== id)),
    [dismissed, persist],
  );
  const reset = useCallback(() => persist([]), [persist]);

  return { dismissed, dismiss, undismiss, reset };
}
