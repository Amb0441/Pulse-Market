-- 008: Realtime for listings and conversations
--
-- The feed, the seller's own list and the inbox were all "live" by polling
-- every 10-15 seconds. A neighbour marking an item sold could therefore take that
-- long to appear anywhere else, and a message sat unread on screen while the
-- reader waited.
--
-- This puts the remaining two tables into the Realtime publication so the API
-- can subscribe to them server-side and push a signal to open browsers. 005 only
-- published `chat_messages`, so message inserts streamed but a new conversation
-- or a status change did not.
--
-- The publication grants Postgres to *emit* change events. It does not grant a
-- browser any read access: the browser has no Supabase key and never queries
-- these tables directly, and the API is what re-reads them over an authorized
-- request. See backend/src/services/realtime.ts.

-- Guarded for the same reason as 005: `supabase_realtime` only exists on hosted
-- Supabase, and re-running this must not fail.
--
-- REPLICA IDENTITY FULL is what makes DELETE and UPDATE payloads usable. Without
-- it a delete event arrives with an empty `old` row, so the server cannot tell
-- which listing or thread disappeared. On `listings` it is also what lets the
-- server read the previous `status` when a seller marks something sold.
--
-- This copies the whole row into the WAL for those tables, which costs storage
-- and adds a little write amplification. That is the price of being able to see
-- a deleted row's identity, and these tables are small.
ALTER TABLE listings REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

DO $pub$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'listings'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.listings';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'conversations'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
    END IF;
  END IF;
END;
$pub$;

-- Verify: should list chat_messages, conversations and listings.
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
