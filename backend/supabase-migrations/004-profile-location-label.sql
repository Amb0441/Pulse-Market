-- 004: give the profile an area name
--
-- Why: the navbar has always shown a location line under the Pulse logo
-- (Navbar.tsx reads `user.neighborhood`, which maps to profiles.location), and
-- the column has existed since the base schema. Nothing ever wrote to it -
-- signup only stored the pin - so every user saw a blank next to the logo.
--
-- `location` is a label the user chose for their area ("Baguio City, Benguet").
-- It is never used to compute distance; lat/lng are. Keeping the two separate
-- is what lets the app show a readable place name while still measuring exactly.
--
-- Run statement by statement in the Supabase SQL editor.

-- 1. The trigger now also copies the label. This only affects NEW signups:
--    existing rows keep a NULL location and fall back to showing their
--    coordinates until they set a label, which the navbar now allows.
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

-- 2. Profiles that already have a pin but no label get their coordinates as a
--    placeholder, so the navbar is never blank for an existing member. This is
--    the real value, not an invented place name.
--
-- UPDATE public.profiles
--    SET location = trim(trailing '.' from trim(trailing '0' from
--          trim(trailing '0' from (round(lat::numeric, 2)::text))) || '°'
--          || CASE WHEN lat < 0 THEN 'S' ELSE 'N' END) || ', '
--          || trim(trailing '.' from trim(trailing '0' from
--          trim(trailing '0' from (round(lng::numeric, 2)::text))) || '°'
--          || CASE WHEN lng < 0 THEN 'W' ELSE 'E' END)
--  WHERE lat IS NOT NULL AND location IS NULL;
