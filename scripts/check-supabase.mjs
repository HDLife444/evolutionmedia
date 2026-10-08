import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Set the public Supabase URL and publishable key in apps/web/.env.local or the environment.');
  process.exit(1);
}

try {
  const settings = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  });
  if (!settings.ok) throw new Error(`Supabase Auth returned HTTP ${settings.status}.`);
  const auth = await settings.json();
  console.log('Supabase Auth reachable; email/password enabled:', auth.external?.email === true);

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  const { data, error } = await client.from('songs').select('id').limit(1);
  if (error) throw new Error(`Catalog check failed (${error.code}): ${error.message}`);
  if (data.length !== 0) throw new Error('Anonymous callers can read songs. Check RLS before continuing.');
  console.log('Songs endpoint exists and returned no rows to the anonymous caller.');
  console.log('Authenticated visibility and Storage access still require separate checks.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Supabase connection check failed.');
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
}
