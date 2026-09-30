/** Verifies the signup path against the live database. Run after any auth-config
 * or handle_new_user trigger change: creates a throwaway account, checks creation,
 * email confirmation, the profile row and sign-in, then deletes it. Exits non-zero. */
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const email = `verify-signup-${stamp}@pulse-market.test`;
const password = 'Verify-Only-Pw-123!';
const username = `verify_${stamp}`;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

let userId: string | null = null;

try {
  console.log(`verifying signup with ${email}\n`);

  console.log('1. account creation');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) {
    check('account created', false, `${error.name}: ${error.message}`);
    console.log(
      '\n  If this says "Database error creating new user", the handle_new_user\n' +
        '  trigger is failing. Apply backend/supabase-migrations/001-fix-signup-trigger.sql',
    );
    process.exit(1);
  }
  userId = data.user!.id;
  check('account created', true, userId);

  console.log('\n2. no email confirmation required');
  check('email_confirmed_at is set', Boolean(data.user!.email_confirmed_at));

  console.log('\n3. trigger created the profile row');
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId!)
    .maybeSingle();
  if (profileErr) check('profile row exists', false, profileErr.message);
  else if (!profile) {
    check('profile row exists', false, 'no row - the trigger did not fire');
  } else {
    check('profile row exists', true);
    check('username came from user_metadata', profile.username === username, profile.username);
  }

  console.log('\n4. the new account can sign in and read itself');
  const asUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: loginErr } = await asUser.auth.signInWithPassword({
    email,
    password,
  });
  if (loginErr || !session.session) {
    check('sign in succeeds', false, loginErr?.message);
  } else {
    check('sign in succeeds', true);
    check('returned a usable access token', Boolean(session.session.access_token));
    const { data: me, error: meErr } = await asUser.auth.getUser();
    check('token resolves to the new user', !meErr && me.user?.id === userId, meErr?.message);
  }
} finally {
  if (userId) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    console.log(
      `\ncleanup: ${delErr ? `WARNING could not delete ${userId} (${delErr.message})` : `deleted ${userId}`}`,
    );
  }
}

console.log(`\n${failures === 0 ? 'SIGNUP VERIFIED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
