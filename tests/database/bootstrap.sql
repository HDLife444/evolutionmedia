-- Local test stand-ins only. Hosted Supabase supplies these objects itself.
create schema auth;
create schema extensions;
create role authenticated nologin;
create role anon nologin;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth, extensions to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
