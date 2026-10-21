-- Local test stand-ins only. Hosted Supabase supplies these objects itself.
create schema auth;
create schema extensions;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth, extensions to authenticated, anon;
grant usage on schema public, auth, extensions to service_role;
grant execute on function auth.uid() to authenticated, anon;

-- Minimal Storage catalog for policy/RPC tests, not a Storage upload service.
create schema storage;
grant usage on schema storage to service_role;
create table storage.buckets (
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
 name text not null, metadata jsonb, unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
