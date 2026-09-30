-- Fixes "Database error creating new user" (AuthRetryableFetchError) on signup.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent: safe to run more than once.
--
-- ---------------------------------------------------------------------
-- Step 1 (optional, diagnostic): confirm the cause before changing anything.
-- ---------------------------------------------------------------------
-- The INSERT below is denied by row-level security if the trigger is not
-- SECURITY DEFINER. During an INSERT on auth.users there is no request JWT, so
-- auth.uid() is NULL, and the profiles policy
--     WITH CHECK (auth.uid() = id)
-- evaluates to NULL and blocks the row. Supabase surfaces that as a generic
-- "Database error creating new user" with no hint about RLS.
--
-- Paste this to see what is actually installed:
--
--   SELECT
--     p.proname,
--     pg_get_functiondef(p.oid) AS definition,
--     r.rolname AS owner,
--     p.prosecdef AS is_security_definer
--   FROM pg_proc p
--   JOIN pg_roles r ON r.oid = p.proowner
--   WHERE p.proname = 'handle_new_user';
--
-- If is_security_definer is false, that is the bug. The repo's
-- supabase-schema.sql already has SECURITY DEFINER, so the live database was
-- most likely created from an earlier revision of that file.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- Step 2: the fix
-- ---------------------------------------------------------------------

-- SECURITY DEFINER  - the trigger inserts as the function owner, so the
--                     profiles RLS policies do not apply to it.
-- SET search_path='' - the function writes no unqualified table names, so
--                     pinning the path removes search_path hijacking as a
--                     privilege-escalation route.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), ''),
      'user_' || substr(NEW.id::text, 1, 8)
    )
  )
  RETURN NEW;
END;
$$;

-- The function is only ever called by the trigger, never by end users.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, supabase_admin;

-- Recreate the trigger so it picks up the new definition.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------
-- Step 3: verify
-- ---------------------------------------------------------------------
-- Run:  bun run backend/scripts/verify-signup.ts
-- It creates a throwaway account, checks the trigger made a profile row, then
-- deletes the account. It prints PASS/FAIL and exits non-zero on failure.
