-- Apply after the initial schema. This migration does not index songs or grant
-- administrator access automatically. Assign trusted users through SQL only.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.song_administrators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.song_administrators enable row level security;

create function public.is_song_administrator() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.song_administrators where user_id = auth.uid())
$$;
revoke all on function public.is_song_administrator() from public, anon;
grant execute on function public.is_song_administrator() to authenticated;

create table public.song_ingestion_jobs (
 song_id uuid primary key references public.songs(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 status text not null default 'awaiting_upload'
  check(status in ('awaiting_upload','queued','processing','searchable','failed')),
 storage_path text not null unique,
 file_size bigint not null check(file_size between 1 and 52428800),
 mime_type text not null check(mime_type in ('audio/mpeg','audio/wav','audio/flac')),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 submission jsonb not null,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.song_ingestion_jobs enable row level security;
grant select on public.song_ingestion_jobs to authenticated;
create policy ingestion_jobs_read on public.song_ingestion_jobs for select to authenticated
 using (owner_id = (select auth.uid()) and (select public.is_song_administrator()));
create index ingestion_jobs_status_idx on public.song_ingestion_jobs(status, created_at);

-- Only a private bucket is acceptable; do not silently repurpose a public one.
do $$
begin
 if exists(select 1 from storage.buckets where id = 'song-assets' and public) then
  raise exception 'song-assets is public; resolve bucket visibility before migration';
 end if;
end $$;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('song-assets','song-assets',false,52428800,array['audio/mpeg','audio/wav','audio/flac'])
on conflict(id) do nothing;

create policy admin_song_audio_upload on storage.objects for insert to authenticated
 with check(bucket_id = 'song-assets' and (select public.is_song_administrator())
  and exists(select 1 from public.song_ingestion_jobs j
    where j.storage_path = name and j.owner_id = (select auth.uid())
      and j.status = 'awaiting_upload'));
create policy admin_song_audio_read on storage.objects for select to authenticated
 using(bucket_id = 'song-assets' and (select public.is_song_administrator())
  and exists(select 1 from public.song_ingestion_jobs j
    where j.storage_path = name and j.owner_id = (select auth.uid())));

create function public.begin_song_ingestion(p_song_id uuid, p_submission jsonb)
returns public.song_ingestion_jobs
language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
 v_job public.song_ingestion_jobs;
 v_size bigint;
 v_mime text;
 v_ext text;
 v_visibility text;
begin
 if v_uid is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode = '42501';
 end if;
 -- Require metadata and evidence even when RPC is called outside the web app.
 if jsonb_typeof(p_submission) is distinct from 'object'
  or length(trim(coalesce(p_submission->>'title',''))) not between 1 and 200
  or length(trim(coalesce(p_submission->>'development_goal',''))) not between 1 and 1000
  or length(trim(coalesce(p_submission->>'emotional_progression',''))) not between 1 and 1000
  or length(trim(coalesce(p_submission->>'provenance',''))) not between 1 and 2000
  or length(coalesce(p_submission->>'lyrics','')) > 50000
  or length(coalesce(p_submission->>'description','')) > 5000
  or length(trim(coalesce(p_submission->>'origin_provider',''))) not between 1 and 100
  or coalesce(p_submission->>'rights_confirmed','false') <> 'true'
  or coalesce(p_submission->>'sha256','') !~ '^[a-f0-9]{64}$'
  or coalesce(p_submission->>'file_size','') !~ '^[0-9]{1,8}$'
  or jsonb_typeof(p_submission->'genre') is distinct from 'array'
  or jsonb_typeof(p_submission->'mood') is distinct from 'array' then
  raise exception 'Invalid song metadata or rights confirmation' using errcode = '22023';
 end if;
 if jsonb_array_length(p_submission->'genre') > 10 or jsonb_array_length(p_submission->'mood') > 10
  or exists(select 1 from jsonb_array_elements_text(p_submission->'genre') x where length(x) not between 1 and 80)
  or exists(select 1 from jsonb_array_elements_text(p_submission->'mood') x where length(x) not between 1 and 80) then
  raise exception 'Invalid genre or mood' using errcode = '22023';
 end if;
 v_size := (p_submission->>'file_size')::bigint;
 v_mime := p_submission->>'mime_type';
 v_ext := case v_mime when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'audio/flac' then 'flac' end;
 v_visibility := p_submission->>'visibility';
 if v_size not between 1 and 52428800 or v_ext is null
  or v_visibility is null or v_visibility not in ('collective','private')
  or (v_visibility = 'collective' and coalesce(p_submission->>'collective_consent','false') <> 'true')
  or coalesce(p_submission->>'reuse_allowed','false') not in ('true','false') then
  raise exception 'Invalid file or sharing consent' using errcode = '22023';
 end if;
 -- Serialize retries with the same UUID, then preserve the original submission.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_song_id::text, 0));
 select * into v_job from public.song_ingestion_jobs where song_id = p_song_id;
 if found then
  if v_job.owner_id <> v_uid or v_job.submission <> p_submission then
   raise exception 'Upload identifier already used' using errcode = '22023';
  end if;
  return v_job;
 end if;
 insert into public.songs(id, owner_id, title, description, lyrics, origin_provider,
  visibility, rights_status, reuse_allowed, genre, mood, metadata)
 values(p_song_id, v_uid, trim(p_submission->>'title'), p_submission->>'description',
  p_submission->>'lyrics', trim(p_submission->>'origin_provider'), 'private', 'cleared',
  (coalesce(p_submission->>'reuse_allowed','false'))::boolean,
  array(select jsonb_array_elements_text(p_submission->'genre')),
  array(select jsonb_array_elements_text(p_submission->'mood')),
  jsonb_build_object('development_goal',p_submission->>'development_goal',
    'emotional_progression',p_submission->>'emotional_progression'));
 insert into public.song_ingestion_jobs(song_id, owner_id, storage_path, file_size, mime_type, sha256, submission)
 values(p_song_id, v_uid, v_uid::text || '/' || p_song_id::text || '/audio.' || v_ext,
  v_size, v_mime, p_submission->>'sha256', p_submission)
 returning * into v_job;
 return v_job;
end $$;
revoke all on function public.begin_song_ingestion(uuid,jsonb) from public, anon;
grant execute on function public.begin_song_ingestion(uuid,jsonb) to authenticated;

create function public.complete_song_ingestion(p_song_id uuid)
returns public.song_ingestion_jobs
language plpgsql security definer set search_path = '' as $$
declare v_job public.song_ingestion_jobs;
begin
 if auth.uid() is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode = '42501';
 end if;
 select * into v_job from public.song_ingestion_jobs
  where song_id = p_song_id and owner_id = auth.uid() for update;
 if not found then raise exception 'Upload not found' using errcode = '42501'; end if;
 if v_job.status <> 'awaiting_upload' then return v_job; end if;
 if not exists(select 1 from storage.objects where bucket_id = 'song-assets'
   and name = v_job.storage_path and (metadata->>'size')::bigint = v_job.file_size
   and metadata->>'mimetype' = v_job.mime_type) then
  raise exception 'Audio upload is missing or does not match its manifest' using errcode = '22023';
 end if;
 insert into public.song_assets(song_id,asset_type,storage_path,mime_type,sha256)
 values(p_song_id,'audio',v_job.storage_path,v_job.mime_type,v_job.sha256);
 update public.songs set visibility = v_job.submission->>'visibility', updated_at = now()
  where id = p_song_id;
 update public.song_ingestion_jobs set status = 'queued', updated_at = now()
  where song_id = p_song_id returning * into v_job;
 return v_job;
end $$;
revoke all on function public.complete_song_ingestion(uuid) from public, anon;
grant execute on function public.complete_song_ingestion(uuid) to authenticated;
commit;
