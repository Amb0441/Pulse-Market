-- 009: reviews and notifications
--
-- Reviews close the trust loop this marketplace runs on: after a sale, each
-- side rates the other. Notifications are the inbox that says something happened
-- while the member was away - a message, a status change, a review, a listing
-- going live. Both previously lived only in React state, so a reload threw them
-- away and nobody ever saw one twice.
--
-- Design:
--   * One review per person per conversation, and only on a sold listing. The
--     API checks participation and status; UNIQUE(conversation_id, reviewer_id)
--     is the backstop, and a duplicate submit returns the existing row instead
--     of erroring, so a double tap cannot create two.
--   * The review keeps a text snapshot of the listing title rather than a
--     foreign key, so renaming the item does not rewrite what someone rated.
--   * Notifications are written by the API only (service role). There is no
--     client INSERT policy: nobody may put a notification in someone else's
--     inbox. The UPDATE policy exists only so a member may mark their own read.
--   * A notification write never fails the action that produced it; the API
--     logs and continues.
--
-- PASTE-FRIENDLY: statements are separate and none use dollar-quoted blocks, so
-- this can be pasted into the Supabase SQL editor as a whole.

-- 1. Reviews.
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id UUID,
  listing_title TEXT NOT NULL DEFAULT '',
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (reviewer_id <> target_user_id),
  UNIQUE (conversation_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS reviews_target_idx ON reviews (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx ON reviews (reviewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews (target_user_id, rating);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are a trust signal, so any signed-in member may read them. The API
-- (service role) bypasses this either way; this is the second line for anything
-- that talks to Supabase with a user token.
DROP POLICY IF EXISTS "Members can read reviews" ON reviews;
CREATE POLICY "Members can read reviews"
  ON reviews FOR SELECT TO authenticated USING (true);

-- The anon key may write its own review and nobody else's.
DROP POLICY IF EXISTS "Members can review their own transactions" ON reviews;
CREATE POLICY "Members can review their own transactions"
  ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);

-- 2. Notifications.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'listing', 'status', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  listing_id UUID,
  conversation_id UUID,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own notifications" ON notifications;
CREATE POLICY "Members can view their own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can mark their own notifications read" ON notifications;
CREATE POLICY "Members can mark their own notifications read"
  ON notifications FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Deliberately no INSERT policy: notifications come from the API only.
