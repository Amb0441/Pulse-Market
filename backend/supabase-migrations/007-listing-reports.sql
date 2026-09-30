-- 007: listing reports
--
-- Why: the report button in the listing modal was rendered but inert. Reporting
-- a scam listing did nothing, so the one signal that would have caught it - a
-- member saying "this is fraud" - was discarded.
--
-- Design:
--   * One open report per person per listing. Re-reporting the same listing is a
--     no-op rather than an error, so a double tap cannot spam the queue.
--   * Reports are private to the reporter. Only an admin may read the queue, and
--     no such role exists in the schema yet, so the SELECT policy is deliberately
--     restrictive. Do not loosen this without adding real admin authorization.
--   * Reports survive the listing. ON DELETE CASCADE would erase the evidence
--     exactly when a listing is deleted for being fraudulent, so the row keeps a
--     text snapshot of the title and seller instead.
--
-- PASTE-FRIENDLY: statements are separate and none use dollar-quoted blocks, so
-- this can be pasted into the Supabase SQL editor as a whole.

-- 1. The table.
CREATE TABLE IF NOT EXISTS listing_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'scam', 'prohibited', 'duplicate', 'inappropriate', 'other')),
  -- Bounded in the API, not here: free text from an untrusted client on a public
  -- endpoint is a storage-abuse target, so the route caps it and trims it.
  details TEXT NOT NULL DEFAULT '',
  -- Snapshot of the listing at report time. Intentionally not a foreign key, so
  -- deleting a fraudulent listing does not delete the report about it.
  listing_title TEXT,
  reported_seller_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One open report per person per listing.
  UNIQUE(reporter_id, listing_id)
);

-- 2. An index for the moderation queue, which reads newest first, and one for
--    "how many reports does this listing have", which is the lookup that decides
--    whether to hide a listing.
CREATE INDEX IF NOT EXISTS listing_reports_created_at_idx ON listing_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS listing_reports_listing_idx ON listing_reports (listing_id);

-- 3. RLS.
ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;

-- A reporter may confirm their own report landed. Nobody else reads it: an
-- unrestricted SELECT here would publish a member's accusations to every caller.
DROP POLICY IF EXISTS "Reporters can view their own reports" ON listing_reports;

CREATE POLICY "Reporters can view their own reports"
  ON listing_reports FOR SELECT USING (auth.uid() = reporter_id);

-- Insert and update are permitted only through the API, which uses the
-- service-role key and checks the caller. No client-facing INSERT policy is
-- created, so the anon key cannot file a report in someone's name.
--
-- Verify: SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'listing_reports';
