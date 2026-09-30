-- 003: real coordinates for profiles and listings
--
-- Why: the app used a free-text `location` on both tables, so nothing could be
-- measured. `distanceKm` was always undefined, the map could not pin a single
-- listing, and signup had no way to know roughly where a user was. Both tables
-- now carry real coordinates.
--
-- PASTE-FRIENDLY: run the statements one at a time in the Supabase SQL editor.
-- Uses named dollar quotes ($add$, $fn$) because the plain `$$` form breaks the
-- editor's dollar-quote parsing. No `DO $$` blocks, so nothing needs splitting.

-- 1. profiles: the user's chosen home pin, set at signup.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 2. listings: where the item actually is.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 3. Guard against half-written pairs. An incomplete pair is unusable: every
--    distance calculation needs both, and `lat` alone would be read as a real
--    position.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_lat_lng_pair;
ALTER TABLE profiles ADD CONSTRAINT profiles_lat_lng_pair
  CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_lat_lng_pair;
ALTER TABLE listings ADD CONSTRAINT listings_lat_lng_pair
  CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL));

-- 4. Range checks. A pin is a real coordinate, so out-of-range values are data
--    corruption rather than a user mistake worth storing.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_lat_range;
ALTER TABLE profiles ADD CONSTRAINT profiles_lat_range
  CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_lng_range;
ALTER TABLE profiles ADD CONSTRAINT profiles_lng_range
  CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_lat_range;
ALTER TABLE listings ADD CONSTRAINT listings_lat_range
  CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90));

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_lng_range;
ALTER TABLE listings ADD CONSTRAINT listings_lng_range
  CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180));

-- 5. Index for "listings near me". Without this the radius filter is a full
--    scan, and it is the query the app runs on every feed load.
CREATE INDEX IF NOT EXISTS listings_lat_lng_idx ON listings (lat, lng);
CREATE INDEX IF NOT EXISTS profiles_lat_lng_idx ON profiles (lat, lng);

-- 6. Carry the signup coordinates into the profile row.
--
-- The trigger inserts the profile the moment the auth user is created, so this
-- is where the chosen pin has to land. It reads `lat`/`lng` from the metadata
-- the signup route sends; existing accounts simply keep NULL until they pick a
-- location, which every distance-aware view already treats as "unknown".
--
-- SECURITY DEFINER is required (not incidental): the caller is the anon signup
-- request, which has no rights on `profiles`. Without it this insert is rejected
-- by RLS and signup fails with a bare "Database error creating new user".
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, username, lat, lng)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NULLIF(NEW.raw_user_meta_data->>'lat', '')::double precision,
    NULLIF(NEW.raw_user_meta_data->>'lng', '')::double precision
  );
  RETURN NEW;
END;
$fn$;

-- Verify: both columns exist on both tables.
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name IN ('profiles', 'listings') AND column_name IN ('lat', 'lng')
--   ORDER BY table_name, column_name;
