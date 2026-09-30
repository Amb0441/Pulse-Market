import type { Request, Response } from 'express';
import { supabase } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

/** Live updates pushed over SSE. The browser has no Supabase client, so this API
 * relays Postgres changes as topic names only - never rows; the client refetches
 * through normal authenticated routes, keeping authorization and radius intact. */

/** The only two things a browser is told. */
export type RealtimeTopic = 'listings' | 'chats';

interface Subscriber {
  userId: string;
  /** Writes one SSE frame. */
  send: (topic: RealtimeTopic) => void;
  close: () => void;
}

/** userId -> that user's open streams. One user may have several tabs open. */
const subscribers = new Map<string, Set<Subscriber>>();

function publish(topic: RealtimeTopic): void {
  if (subscribers.size === 0) return;
  for (const set of subscribers.values()) {
    for (const sub of set) {
      try {
        sub.send(topic);
      } catch {
        // A dead connection must not stop the others; the subscriber's own error
        // handler removes it, and this loop only skips the frame.
      }
    }
  }
}

/** Removes a subscriber on disconnect and before writing, so a stream whose
 * socket is already gone is dropped rather than retried on every change, and an
 * empty per-user set is cleaned up with it. */
function unsubscribe(userId: string, sub: Subscriber): void {
  const set = subscribers.get(userId);
  if (!set) return;
  set.delete(sub);
  if (set.size === 0) subscribers.delete(userId);
}

/** Streams one member may hold open at once. `/api/realtime` is exempt from the
 * request limiter, so this is the only bound on sockets per account; the cap is
 * per user so one flaky reconnect burst cannot lock everyone out. */
export const MAX_STREAMS_PER_USER = 6;

/** Opens an SSE stream for one signed-in member. The client streams with `fetch`
 * rather than `EventSource`, which cannot send an Authorization header without
 * putting the token in the query string, so this writes to the raw response. */
export function openRealtimeStream(req: Request, userId: string, res: Response): void {
  const open = subscribers.get(userId)?.size ?? 0;
  if (open >= MAX_STREAMS_PER_USER) {
    audit.warn('realtime_stream_cap', { userId, open });
    res.status(429).json({
      error: {
        code: 'TOO_MANY_STREAMS',
        message: 'Too many live connections. Close another tab and try again.',
      },
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Tells nginx not to buffer the stream; otherwise frames arrive in one lump
  // when the buffer fills, which reads the same as a broken connection.
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  // Nagle holds a one-line frame back waiting for more bytes; setNoDelay stops a
  // sub-second push from turning into a visible delay.
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();

  let alive = true;
  const sub: Subscriber = {
    userId,
    send: (topic) => {
      if (!alive) return;
      res.write(`data: ${JSON.stringify({ topic })}\n\n`);
    },
    close: () => {
      alive = false;
    },
  };

  const set = subscribers.get(userId) ?? new Set<Subscriber>();
  set.add(sub);
  subscribers.set(userId, set);

  // A comment frame on connect flushes the headers so the browser's reader
  // resolves, and shows the stream is live before any change has happened.
  res.write(': connected\n\n');

  /** Comment-only heartbeat every 25s: keeps idle proxies from closing a
   * connection they believe is dead, and doubles as the write that detects a
   * client socket the browser has already dropped. */
  const heartbeat = setInterval(() => {
    if (!alive) return;
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      cleanup();
    }
  }, 25_000);

  function cleanup(): void {
    if (!alive) return;
    alive = false;
    clearInterval(heartbeat);
    unsubscribe(userId, sub);
    res.end();
  }

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

/** Subscribes to Postgres changes and fans them out. One channel for the whole
 * process rather than one per subscriber, so every open browser shares a single
 * Realtime connection; called once at boot. */
export function startRealtime(): void {
  if (process.env.NODE_ENV === 'test') return;

  const channel = supabase
    .channel('pulse-market-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
      // Covers a new post, an edit, and the status change to sold/reserved.
      publish('listings');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
      publish('chats');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
      // A thread being opened, or `last_message_at` moving, changes the inbox
      // ordering and whether an unread badge is showing.
      publish('chats');
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        audit.info('realtime_subscribed', {});
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Not fatal: the client keeps polling as a fallback, so a broken
        // subscription degrades to polling rather than a dead feed.
        audit.warn('realtime_unavailable', { status });
      }
    });
}

export function stopRealtime(): void {
  try {
    supabase.removeChannel(supabase.channel('pulse-market-realtime'));
  } catch {
    // Nothing useful to do while shutting down.
  }
  subscribers.clear();
}

/** Exposed for diagnostics: how many streams are open right now. */
export function realtimeSubscriberCount(): number {
  let n = 0;
  for (const set of subscribers.values()) n += set.size;
  return n;
}
