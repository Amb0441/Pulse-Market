-- 005: real conversations and chat messages
--
-- Why: chat had no backend at all. Threads lived in React state, so they
-- vanished on refresh, and "Message seller" on your own listing created a
-- thread whose buyer and seller were the same account - which then let the
-- owner leave a review on themselves.
--
-- This replaces the legacy `messages` table as the message store. That table is
-- keyed only by `listing_id`, which cannot say *which buyer* a message belongs
-- to, so a seller with two interested buyers could not tell the threads apart.
-- It is left in place rather than dropped: nothing ever wrote to it through the
-- API, but dropping a table is not reversible, so that decision is left to you.
--
-- PASTE-FRIENDLY: run the statements one at a time in the Supabase SQL editor.
-- Uses named dollar quotes ($fn$, $pub$) because the plain `$$` form breaks the
-- editor's dollar-quote parsing.

-- 1. A conversation is one thread, per listing, per buyer.
--
--    `buyer_id <> seller_id` is a hard guarantee, not a style choice: it is the
--    database refusing to represent a self-thread even if a route forgets to
--    check. The unique constraint makes "start a chat" idempotent - tapping
--    Message twice reopens the same thread instead of creating a second one.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Denormalised so the thread list can sort by recent activity without
  -- aggregating the messages table on every load. Kept current by the trigger
  -- below.
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT conversations_distinct_participants CHECK (buyer_id <> seller_id),
  CONSTRAINT conversations_one_thread_per_buyer UNIQUE (listing_id, buyer_id)
);

-- 2. The messages themselves. `read_at` is a timestamp rather than a boolean so
--    "unread" is queryable as `read_at IS NULL` and we keep when it was read.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Whitespace-only messages are not messages.
  CONSTRAINT chat_messages_body_not_blank CHECK (length(btrim(body)) > 0)
);

-- 3. Indexes. The thread list sorts by recent activity, and opening a thread
--    reads one conversation's messages in time order.
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations (seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_listing ON conversations (listing_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, created_at);

-- 4. Keep conversations.last_message_at current.
--    AFTER INSERT (not BEFORE UPDATE on conversations) so a message always
--    pushes its thread to the top of the list.
CREATE OR REPLACE FUNCTION touch_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_chat_message_created ON chat_messages;
CREATE TRIGGER on_chat_message_created
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION touch_conversation_on_message();

-- 5. Row Level Security.
--
--    The API uses the service_role key, which bypasses RLS, so these policies
--    are the second line of defence - not the first. The route handlers do the
--    real authorization. They still matter: they are what protects the data if a
--    client ever talks to Supabase directly instead of through this API.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their conversations" ON conversations;
CREATE POLICY "Participants can view their conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyers can start conversations" ON conversations;
CREATE POLICY "Buyers can start conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Participants can view messages" ON chat_messages;
CREATE POLICY "Participants can view messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)
    )
  );

DROP POLICY IF EXISTS "Participants can send messages" ON chat_messages;
CREATE POLICY "Participants can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)
    )
  );

DROP POLICY IF EXISTS "Recipients can mark messages read" ON chat_messages;
CREATE POLICY "Recipients can mark messages read"
  ON chat_messages FOR UPDATE
  USING (
    auth.uid() <> sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)
    )
  );

-- 6. Realtime. Guarded because `supabase_realtime` only exists on hosted
--    Supabase, and re-running this must not fail the migration.
--
--    ALTER PUBLICATION is a utility statement, so inside PL/pgSQL it must go
--    through EXECUTE - written inline it is a syntax error at run time.
DO $pub$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'chat_messages'
     )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
  END IF;
END;
$pub$;

-- Verify:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('conversations', 'chat_messages');
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'conversations'::regclass;
