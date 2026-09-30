// Change stream read with `fetch`, because EventSource cannot set an
// Authorization header; the payload is a topic name, so the callback refetches.
export type RealtimeTopic = 'listings' | 'chats';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Stream URL at the configured API origin; an empty origin means the dev proxy. */
function streamUrl(): string {
  return `${API_BASE}/api/realtime`;
}

/** Handle to an open stream; close() aborts it and cancels further retries. */
export interface RealtimeHandle {
  close: () => void;
}

/**
 * Opens the stream until closed; reconnects with backoff and reads a fresh token on each connect.
 */
export function subscribeRealtime(
  getAccessToken: () => Promise<string | null>,
  onTopic: (topic: RealtimeTopic) => void,
): RealtimeHandle {
  let closed = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  /** Exponential backoff: 1s doubling to a 60s cap. */
  const backoffMs = (n: number): number => Math.min(60_000, 1_000 * 2 ** Math.min(n, 6));

  /**
   * Consecutive 401s, tracked separately from `attempt`; persistent 401 is backed off hard.
   */
  let consecutiveUnauthorized = 0;

  async function connect(): Promise<void> {
    if (closed) return;

    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    if (!token) {
      // Not signed in, or the refresh failed. Do not spin.
      attempt = 0;
      scheduleRetry(10_000);
      return;
    }
    if (closed) return;

    controller = new AbortController();

    try {
      const res = await fetch(streamUrl(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (res.status === 401) {
        consecutiveUnauthorized += 1;
        // Three strikes: the session is not recoverable by retrying, and further
        // attempts only spend the auth rate limit.
        if (consecutiveUnauthorized >= 3) {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            consecutiveUnauthorized = 0;
            attempt = 0;
            void connect();
          }, 5 * 60_000);
          return;
        }
        scheduleRetry(backoffMs(attempt++));
        return;
      }

      if (!res.ok || !res.body) {
        scheduleRetry(backoffMs(attempt++));
        return;
      }

      // Connected and authenticated; a success resets both counters so the next
      // dropped connection starts the backoff from scratch.
      attempt = 0;
      consecutiveUnauthorized = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (closed) return;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; ':' comment frames are
        // heartbeats and carry no data, so they are skipped rather than parsed.
        let split: number;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);

          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed = JSON.parse(payload) as { topic?: RealtimeTopic };
              if (parsed.topic === 'listings' || parsed.topic === 'chats') {
                onTopic(parsed.topic);
              }
            } catch {
              // A malformed frame is not worth tearing the connection down for.
            }
          }
        }
      }

      // Server closed it. Reconnect.
      scheduleRetry(backoffMs(attempt++));
    } catch (err) {
      if (closed) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      scheduleRetry(backoffMs(attempt++));
    }
  }

  function scheduleRetry(delay: number): void {
    if (closed) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  }

  void connect();

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    },
  };
}
