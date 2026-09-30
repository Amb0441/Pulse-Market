-- 006: sold listings stay visible
--
-- Why: reads were restricted to `status = 'active'`, so the moment a seller
-- marked an item sold it disappeared - from the feed, and more importantly from
-- their own dashboard, which derived "my listings" from the same query. Selling
-- something destroyed the record that you had sold it. The UI already knew how
-- to render a sold listing (grey image, "Sold" badge, messaging disabled); the
-- rows simply never reached it.
--
-- `archived` stays hidden: that is a seller deliberately taking an item down.
-- The `get_listings` route uses the same three statuses, so the API and direct
-- Supabase reads agree.
--
-- PASTE-FRIENDLY: run the statements one at a time in the Supabase SQL editor.
-- No dollar-quoted blocks, so nothing needs splitting.

-- 1. The read policy.
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON listings;
DROP POLICY IF EXISTS "Visible listings are viewable by everyone" ON listings;

CREATE POLICY "Visible listings are viewable by everyone"
  ON listings FOR SELECT
  USING (status IN ('active', 'reserved', 'sold'));

-- 2. Confirm the three visible statuses are what the CHECK constraint allows,
--    so a future migration adding a status gets a decision here rather than
--    silently disappearing from the feed.
--
-- Verify: SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'listings';
