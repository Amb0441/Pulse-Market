import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { app } from '../src/server.js';
import {
  assertCanStartConversation,
  assertParticipant,
  canStartConversation,
  counterpartId,
  isParticipant,
  lastMessage,
  unreadCount,
  type ConversationParticipants,
} from '../src/services/chat.js';

const BUYER = 'buyer-1';
const SELLER = 'seller-1';
const STRANGER = 'stranger-1';

/** The validation error shape on the wire, as returned by errorHandler. */
type ValidationErrorBody = {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
};

const conversation: ConversationParticipants = {
  id: 'conv-1',
  buyer_id: BUYER,
  seller_id: SELLER,
};

/** Runs `fn` and returns the thrown error, so its status and message can be asserted. */
function caught(fn: () => void): { statusCode?: number; code?: string; message?: string } | null {
  try {
    fn();
  } catch (err) {
    return err as { statusCode?: number; code?: string; message?: string };
  }
  return null;
}

describe('chat: participation', () => {
  test('both parties are participants', () => {
    expect(isParticipant(conversation, BUYER)).toBe(true);
    expect(isParticipant(conversation, SELLER)).toBe(true);
  });

  test('an outsider is not a participant', () => {
    expect(isParticipant(conversation, STRANGER)).toBe(false);
  });

  test('a participant passes the guard', () => {
    expect(caught(() => assertParticipant(conversation, BUYER))).toBeNull();
  });

  test('an outsider is refused as 404, not 403', () => {
    // 403 would confirm the conversation exists to someone with no business knowing.
    const err = caught(() => assertParticipant(conversation, STRANGER));
    expect(err?.statusCode).toBe(404);
    expect(err?.code).toBe('NOT_FOUND');
  });

  test('counterpart is the other party, from either side', () => {
    expect(counterpartId(conversation, BUYER)).toBe(SELLER);
    expect(counterpartId(conversation, SELLER)).toBe(BUYER);
  });

  test('counterpart refuses an outsider', () => {
    expect(caught(() => counterpartId(conversation, STRANGER))?.statusCode).toBe(404);
  });
});

describe('chat: you cannot message yourself', () => {
  test('your own listing cannot be messaged', () => {
    expect(canStartConversation(SELLER, SELLER)).toBe(false);
  });

  test('someone else listing can be messaged', () => {
    expect(canStartConversation(SELLER, BUYER)).toBe(true);
  });

  test('the refusal is a plain-English 403', () => {
    const err = caught(() => assertCanStartConversation(SELLER, SELLER));
    expect(err?.statusCode).toBe(403);
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.message).not.toMatch(/undefined|null|nan/i);
    expect(err?.message).toMatch(/own listing/i);
  });
});

describe('chat: unread count', () => {
  const messages = [
    { sender_id: BUYER, read_at: null, created_at: '2026-01-01T00:00:00Z' },
    { sender_id: SELLER, read_at: null, created_at: '2026-01-01T00:01:00Z' },
    { sender_id: SELLER, read_at: '2026-01-01T00:02:00Z', created_at: '2026-01-01T00:01:30Z' },
  ];

  test('counts only what the other person sent and you have not read', () => {
    // From the buyer's side: one unread from the seller, one already read, own message never counts.
    expect(unreadCount(messages, BUYER)).toBe(1);
  });

  test('your own sent messages are never unread', () => {
    const onlyMine = messages.filter((m) => m.sender_id === BUYER);
    expect(unreadCount(onlyMine, BUYER)).toBe(0);
  });
});

describe('chat: last message', () => {
  test('is the newest by time, regardless of array order', () => {
    const outOfOrder = [
      { sender_id: BUYER, read_at: null, created_at: '2026-01-01T00:05:00Z' },
      { sender_id: SELLER, read_at: null, created_at: '2026-01-01T00:09:00Z' },
      { sender_id: BUYER, read_at: null, created_at: '2026-01-01T00:01:00Z' },
    ];
    expect(lastMessage(outOfOrder)?.created_at).toBe('2026-01-01T00:09:00Z');
  });

  test('an empty thread has no last message', () => {
    expect(lastMessage([])).toBeNull();
  });
});

// --- HTTP surface -----------------------------------------------------------
// Only requests that fail before a database call are exercised; the rest would hit the dummy Supabase URL.

let server: Server;
let base: string;

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
});

const AUTH = { Authorization: 'Bearer test-token' };
const post = (path: string, body: unknown, auth = true) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? AUTH : {}) },
    body: JSON.stringify(body),
  });

describe('chat API: authentication is required', () => {
  test('listing conversations requires a token', async () => {
    const res = await fetch(`${base}/api/chats`);
    expect(res.status).toBe(401);
  });

  test('starting a conversation requires a token', async () => {
    const res = await post('/api/chats', { listingId: '00000000-0000-4000-8000-000000000000' }, false);
    expect(res.status).toBe(401);
  });

  test('reading a thread requires a token', async () => {
    const res = await post('/api/chats/00000000-0000-4000-8000-000000000000/read', {}, false);
    expect(res.status).toBe(401);
  });
});

describe('chat API: input validation', () => {
  test('a non-uuid listing id is rejected', async () => {
    const res = await post('/api/chats', { listingId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.details?.[0]?.field).toBe('listingId');
  });

  test('a non-uuid conversation id is rejected', async () => {
    const res = await post('/api/chats/not-a-uuid/messages', { body: 'hello' });
    expect(res.status).toBe(400);
  });

  test('an empty message is rejected', async () => {
    const res = await post('/api/chats/00000000-0000-4000-8000-000000000000/messages', { body: '' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.details?.[0]?.field).toBe('body');
  });

  test('a whitespace-only message is rejected, not sent as blank', async () => {
    const res = await post('/api/chats/00000000-0000-4000-8000-000000000000/messages', { body: '   ' });
    expect(res.status).toBe(400);
  });

  test('an over-long message is rejected', async () => {
    const res = await post('/api/chats/00000000-0000-4000-8000-000000000000/messages', {
      body: 'x'.repeat(2001),
    });
    expect(res.status).toBe(400);
  });

  test('a client cannot choose who the conversation is with', async () => {
    // sellerId/buyerId are resolved server-side, so sending them is mass assignment that .strict() rejects.
    const res = await post('/api/chats', {
      listingId: '00000000-0000-4000-8000-000000000000',
      sellerId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.status).toBe(400);
  });
});
