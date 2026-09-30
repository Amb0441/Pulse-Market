-- Pulse Market Supabase Schema
--
-- Safe to run against a database that already has it, and safe to run twice.
-- Every statement is guarded, so re-running this no longer fails with
-- `relation "profiles" already exists`. Fresh projects get the whole schema;
-- existing projects get anything still missing, without touching what is there.
--
-- `IF NOT EXISTS` will not alter a table that already exists. That is deliberate:
-- changing an existing table is what the numbered migrations in
-- supabase-migrations/ are for, and silently rewriting live columns here would be
-- far more dangerous than an error.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  -- Home pin, chosen on the map at signup. Drives "what is near me".
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  CONSTRAINT profiles_lat_lng_pair CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN (
    'Furniture',
    'Electronics',
    'Home & Garden',
    'Clothing & Kids',
    'Sports & Outdoors',
    'Books & Media',
    'Free & Giveaway',
    'Other'
  )),
  images JSONB DEFAULT '[]'::jsonb,
  location TEXT,
  -- Where the item is. Both or neither.
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  CONSTRAINT listings_lat_lng_pair CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Listings policies
-- Sold and reserved listings stay visible. Restricting reads to `active` meant a
-- seller lost sight of anything they had sold. Only `archived` is hidden.
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON listings;
DROP POLICY IF EXISTS "Visible listings are viewable by everyone" ON listings;
CREATE POLICY "Visible listings are viewable by everyone"
  ON listings FOR SELECT USING (status IN ('active', 'reserved', 'sold'));

DROP POLICY IF EXISTS "Users can view their own listings" ON listings;
CREATE POLICY "Users can view their own listings"
  ON listings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create listings" ON listings;
CREATE POLICY "Users can create listings"
  ON listings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own listings" ON listings;
CREATE POLICY "Users can update their own listings"
  ON listings FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own listings" ON listings;
CREATE POLICY "Users can delete their own listings"
  ON listings FOR DELETE USING (auth.uid() = user_id);

-- Conversations: one chat thread per listing, per buyer.
--
-- Supersedes the earlier flat `messages` design, which keyed only by
-- `listing_id` and so could not tell a seller which buyer a message came from.
-- `buyer_id <> seller_id` is a hard guarantee against self-threads.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT conversations_distinct_participants CHECK (buyer_id <> seller_id),
  CONSTRAINT conversations_one_thread_per_buyer UNIQUE (listing_id, buyer_id)
);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their conversations" ON conversations;
CREATE POLICY "Participants can view their conversations"
  ON conversations FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyers can start conversations" ON conversations;
CREATE POLICY "Buyers can start conversations"
  ON conversations FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- Chat messages. `read_at` is a timestamp so unread is `read_at IS NULL`.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chat_messages_body_not_blank CHECK (length(btrim(body)) > 0)
);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

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

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- Enable RLS
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Favorites policies
DROP POLICY IF EXISTS "Users can view their own favorites" ON favorites;
CREATE POLICY "Users can view their own favorites"
  ON favorites FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add favorites" ON favorites;
CREATE POLICY "Users can add favorites"
  ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove favorites" ON favorites;
CREATE POLICY "Users can remove favorites"
  ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Reports. See supabase-migrations/007-listing-reports.sql for the reasoning.
-- `listing_id` is deliberately not a foreign key: deleting a fraudulent listing
-- must not delete the report filed against it.
CREATE TABLE IF NOT EXISTS listing_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'scam', 'prohibited', 'duplicate', 'inappropriate', 'other')),
  details TEXT NOT NULL DEFAULT '',
  listing_title TEXT,
  reported_seller_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One open report per person per listing, so a double tap cannot spam the queue.
  UNIQUE(reporter_id, listing_id)
);

CREATE INDEX IF NOT EXISTS listing_reports_created_at_idx ON listing_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS listing_reports_listing_idx ON listing_reports (listing_id);

ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;

-- A reporter may confirm their own report landed. No other client-facing policy:
-- the API holds the service-role key and authorizes the caller, and the anon key
-- must not be able to file a report in someone else's name or read accusations
-- about other members. An admin queue needs real admin authorization, which does
-- not exist in this schema yet.
DROP POLICY IF EXISTS "Reporters can view their own reports" ON listing_reports;
CREATE POLICY "Reporters can view their own reports"
  ON listing_reports FOR SELECT USING (auth.uid() = reporter_id);

-- Reviews and notifications. See supabase-migrations/009-reviews-notifications.sql
-- for the reasoning. `reviews.listing_title` is a text snapshot rather than a
-- foreign key, so renaming an item does not rewrite what was rated.
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
  -- One review per person per conversation, so a double tap cannot create two.
  UNIQUE (conversation_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS reviews_target_idx ON reviews (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx ON reviews (reviewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews (target_user_id, rating);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read reviews" ON reviews;
CREATE POLICY "Members can read reviews"
  ON reviews FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Members can review their own transactions" ON reviews;
CREATE POLICY "Members can review their own transactions"
  ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);

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

-- No INSERT policy: notifications are written by the API (service role) only.

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_listing ON conversations(listing_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
-- The radius search runs on every feed load, so lat/lng get their own index.
CREATE INDEX IF NOT EXISTS listings_lat_lng_idx ON listings(lat, lng);
CREATE INDEX IF NOT EXISTS profiles_lat_lng_idx ON profiles(lat, lng);

-- Trigger to auto-create profile on signup
--
-- SECURITY DEFINER and `search_path = ''` are both required, not stylistic: the
-- signup caller is anonymous and has no grant on `profiles`, so the insert
-- fails under RLS unless the function is privileged. The signup route puts the
-- chosen map pin in user_metadata, and it lands on the profile row here so the
-- user and their location are created together.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, username, lat, lng, location)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NULLIF(NEW.raw_user_meta_data->>'lat', '')::double precision,
    NULLIF(NEW.raw_user_meta_data->>'lng', '')::double precision,
    NULLIF(btrim(NEW.raw_user_meta_data->>'location'), '')
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Keeps conversations.last_message_at current so the thread list can sort by
-- recent activity without aggregating chat_messages on every load.
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
