-- Evolution Media / Sound Vector: initial schema (review before deploying)
create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table public.songs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references auth.users(id) on delete set null,
 title text not null,
 description text,
 lyrics text,
 origin_provider text not null default 'manual',
 provider_generation_id text,
 visibility text not null default 'collective' check (visibility in ('collective','private')),
 reuse_allowed boolean not null default false,
 training_allowed boolean not null default false,
 rights_status text not null default 'unverified'
   check (rights_status in ('unverified','cleared','restricted')),
 industry_status text not null default 'not_requested'
   check (industry_status in ('not_requested','review','approved','distributed')),
 octave_stage integer check (octave_stage between 1 and 12),
 genre text[],
 mood text[],
 bpm numeric check (bpm > 0),
 musical_key text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint private_requires_owner check (visibility <> 'private' or owner_id is not null)
);

create table public.song_assets (
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 asset_type text not null check (asset_type in ('audio','stem','artwork','lyrics','reference')),
 storage_path text not null unique,
 mime_type text,
 sha256 text,
 created_at timestamptz not null default now()
);

create table public.song_embeddings (
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 modality text not null check (modality in ('lyrics','audio','development','description')),
 model_name text not null,
 chunk_index integer not null default 0,
 chunk_text text,
 embedding extensions.vector(1536) not null,
 created_at timestamptz not null default now(),
 unique(song_id,modality,model_name,chunk_index)
);
-- 1536 is a starter dimension; select embedding models before ingestion.

create table public.song_lineage (
 parent_song_id uuid not null references public.songs(id) on delete cascade,
 child_song_id uuid not null references public.songs(id) on delete cascade,
 relationship text not null check (relationship in ('retrieved','reference','remix','extension')),
 created_at timestamptz not null default now(),
 primary key(parent_song_id,child_song_id,relationship),
 check(parent_song_id <> child_song_id)
);

create table public.generation_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 engine text not null,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 input_context jsonb not null default '{}'::jsonb,
 result_song_id uuid references public.songs(id),
 created_at timestamptz not null default now()
);

create table public.song_feedback (
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 rating integer check(rating between 1 and 5),
 helpful boolean,
 notes text,
 created_at timestamptz not null default now()
);

create index songs_visibility_rights_idx on public.songs(visibility,rights_status);
create index song_embeddings_song_idx on public.song_embeddings(song_id);
create index song_assets_song_idx on public.song_assets(song_id);
-- Add an HNSW vector index when corpus and model choice warrant it.

alter table public.songs enable row level security;
alter table public.song_assets enable row level security;
alter table public.song_embeddings enable row level security;
alter table public.song_lineage enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.song_feedback enable row level security;

-- Collective catalog metadata is visible to authenticated users.
-- Rights status and reuse_allowed are NOT a license grant by themselves.
create policy songs_read on public.songs for select to authenticated
 using (visibility='collective' or owner_id=(select auth.uid()));
create policy assets_read on public.song_assets for select to authenticated
 using (exists(select 1 from public.songs s where s.id=song_id
   and (s.visibility='collective' or s.owner_id=(select auth.uid()))));
create policy embeddings_read on public.song_embeddings for select to authenticated
 using (exists(select 1 from public.songs s where s.id=song_id
   and (s.visibility='collective' or s.owner_id=(select auth.uid()))));
create policy lineage_read on public.song_lineage for select to authenticated
 using (exists(select 1 from public.songs s where s.id=parent_song_id
   and (s.visibility='collective' or s.owner_id=(select auth.uid())))
   and exists(select 1 from public.songs s where s.id=child_song_id
   and (s.visibility='collective' or s.owner_id=(select auth.uid()))));
create policy jobs_read on public.generation_jobs for select to authenticated
 using(owner_id=(select auth.uid()));
create policy feedback_read on public.song_feedback for select to authenticated
 using(user_id=(select auth.uid()));

-- All writes are intentionally server-only pending authenticated ingestion service.
-- No public storage buckets or anonymous table policies should be created.
