import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeRealtime, type RealtimeTopic } from '../lib/realtime';
import { getFreshToken } from '../lib/api';

/**
 * Refetches the queries a pushed change affects; marks caches stale so they refetch via the normal API.
 */
export function useRealtimeSync(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    /**
     * Several writes can share a topic, so events are coalesced for ~400ms into one refetch.
     */
    const pending = new Set<RealtimeTopic>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const refetch = (keys: readonly (readonly unknown[])[]) => {
      // Resolves when the refetch settles; not awaited so nothing here blocks
      // the next event.
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const flush = () => {
      flushTimer = null;
      const topics = new Set(pending);
      pending.clear();

      if (topics.has('listings')) {
        // The feed and the seller's own list; a status change has to land on
        // both the feed card and the dashboard row.
        refetch([['listings'], ['myListings']]);
      }

      if (topics.has('chats')) {
        // The thread list plus any open thread's messages, not only the inbox
        // count.
        refetch([['chats'], ['chatMessages']]);
      }

      // Both topics are writes that also filed a notification, so the inbox
      // refetches with them; reviews rely on the 30s poll instead.
      refetch([['notifications']]);
    };

    // Polling stays on underneath: the stream can die on a dropped connection or
    // a buffering proxy, so data must still arrive without it.
    const handle = subscribeRealtime(getFreshToken, (topic) => {
      pending.add(topic);
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 400);
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      handle.close();
    };
  }, [enabled, queryClient]);
}
