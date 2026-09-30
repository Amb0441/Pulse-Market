-- 002: align listing category + status with the API and the UI.
--
-- The API and the UI each had their own vocabulary and the database had a third.
-- `reserved` is a status the UI offers and renders but the CHECK constraint
-- rejected, so marking an item reserved failed at the database even though the
-- rest of the stack allowed it. Categories were never constrained, so rows
-- already hold values the API would refuse to send back.
--
-- PASTE-FRIENDLY: run each statement on its own, one Ctrl+Enter at a time.
-- There is deliberately no DO $$ block here, because the Supabase SQL editor
-- mis-splits dollar-quoted bodies. Re-running any statement is safe.
--
-- Order matters: the UPDATE that rewrites legacy categories must run BEFORE the
-- constraint that forbids them, or the ADD CONSTRAINT fails.

-- 1. Normalise existing rows first, while there is no constraint to trip over.
UPDATE listings
   SET category = 'Other'
 WHERE category IS NULL
    OR category NOT IN (
         'Furniture',
         'Electronics',
         'Home & Garden',
         'Clothing & Kids',
         'Sports & Outdoors',
         'Books & Media',
         'Free & Giveaway',
         'Other'
       );

UPDATE listings SET status = 'active' WHERE status IS NULL;

-- 2. Status: add 'reserved' alongside the existing values.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'reserved', 'sold', 'archived'));

-- 3. Category: constrain to the values the API accepts.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_category_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_category_check
  CHECK (category IN (
    'Furniture',
    'Electronics',
    'Home & Garden',
    'Clothing & Kids',
    'Sports & Outdoors',
    'Books & Media',
    'Free & Giveaway',
    'Other'
  ));

-- 4. A listing must always have a status and a category.
ALTER TABLE listings ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE listings ALTER COLUMN status SET NOT NULL;

ALTER TABLE listings ALTER COLUMN category SET DEFAULT 'Other';

-- 5. 'archived' is hidden from the public feed, so the (status, created_at)
--    filter the feed query uses needs a matching index.
CREATE INDEX IF NOT EXISTS idx_listings_status_created
  ON listings (status, created_at DESC);
