-- Durable generation queue and private recordings. Existing local test tracks
-- are imported by the enrolled worker; no catalog song or playlist is removed.
begin;
create table public.music_workers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 secret_hash text not null unique check(secret_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 last_seen timestamptz,
 ready boolean not null default false,
 revoked_at timestamptz
);
create unique index music_worker_owner_active on public.music_workers(owner_id) where revoked_at is null;
alter table public.music_workers enable row level security;
revoke all on public.music_workers from public, anon, authenticated;
grant select,insert,update,delete on public.music_workers to service_role;

create table public.music_recordings (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 worker_id uuid references public.music_workers(id),
 origin text not null default 'cloud' check(origin in ('cloud','legacy')),
 status text not null check(status in ('queued','running','importing','completed','failed','deleted')),
 moment text not null check((status='deleted' and moment='') or char_length(btrim(moment)) between 1 and 500),
 genre text not null check(genre in ('soul','gospel','rnb','pop','jazz','ambient','cinematic','electronic','rock','hip-hop','classical','country')),
 kind text not null check(kind in ('vocal','instrumental','soundscape')),
 duration integer not null check((origin='cloud' and duration=240) or (origin='legacy' and duration between 10 and 600)),
 lease_id uuid,
 lease_until timestamptz,
 audio_path text,
 lyrics text not null default '' check(char_length(lyrics)<=4096),
 result_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(result_metadata)='object'),
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 actual_duration double precision,
 check(audio_path is null or audio_path=owner_id::text || '/' || id::text || '/track.mp3')
);
create index music_recordings_owner_recent on public.music_recordings(owner_id,created_at desc);
create index music_recordings_queue on public.music_recordings(status,created_at);
alter table public.music_recordings enable row level security;
revoke all on public.music_recordings from public,anon,authenticated;
grant select on public.music_recordings to authenticated;
grant select,insert,update,delete on public.music_recordings to service_role;
create policy music_recordings_owner_read on public.music_recordings for select to authenticated
 using(owner_id=(select auth.uid()) and status<>'deleted');

do $$ begin
 if exists(select 1 from storage.buckets where id='generated-music' and public) then
  raise exception 'generated-music must be private';
 end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('generated-music','generated-music',false,8388608,array['audio/mpeg'])
 on conflict(id) do update set file_size_limit=8388608,allowed_mime_types=array['audio/mpeg'];

create function public.register_music_worker(p_owner uuid,p_secret_hash text) returns public.music_workers
language plpgsql security definer set search_path='' as $$
declare w public.music_workers;
begin
 if not exists(select 1 from private.song_administrators where user_id=p_owner) then
  raise exception 'Administrator required' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('music-worker:' || p_owner::text,0));
 if exists(select 1 from public.music_recordings where owner_id=p_owner and status='running' and lease_until>now()) then
  raise exception 'Wait for the active recording' using errcode='55000';
 end if;
 update public.music_workers set revoked_at=now(),ready=false where owner_id=p_owner and revoked_at is null;
 insert into public.music_workers(owner_id,secret_hash) values(p_owner,p_secret_hash) returning * into w;
 return w;
end $$;
revoke all on function public.register_music_worker(uuid,text) from public,anon,authenticated;
grant execute on function public.register_music_worker(uuid,text) to service_role;

create function public.enqueue_music_recording(p_id uuid,p_moment text,p_genre text,p_kind text) returns public.music_recordings
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); j public.music_recordings; w public.music_workers;
begin
 if uid is null or not public.is_song_administrator() then raise exception 'Administrator required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('music-worker:' || uid::text,0));
 select * into j from public.music_recordings where id=p_id;
 if found then
  if j.owner_id<>uid or j.status='deleted' or j.moment<>btrim(p_moment) or j.genre<>p_genre or j.kind<>p_kind or j.duration<>240 then
   raise exception 'Identifier in use' using errcode='23505';
  end if;
  return j;
 end if;
 select * into w from public.music_workers where owner_id=uid and revoked_at is null and ready and last_seen>now()-interval '90 seconds';
 if not found then raise exception 'Music server offline' using errcode='55000'; end if;
 if (select count(*) from public.music_recordings where owner_id=uid and status in ('queued','running'))>=3
  or (select count(*) from public.music_recordings where owner_id=uid and origin='cloud' and created_at>now()-interval '10 minutes')>=6
  or (select count(*) from public.music_recordings where owner_id=uid and status<>'deleted')>=200 then
  raise exception 'Generation limit reached' using errcode='54000';
 end if;
 insert into public.music_recordings(id,owner_id,worker_id,status,moment,genre,kind,duration)
  values(p_id,uid,w.id,'queued',btrim(p_moment),p_genre,p_kind,240) returning * into j;
 return j;
end $$;
revoke all on function public.enqueue_music_recording(uuid,text,text,text) from public,anon;
grant execute on function public.enqueue_music_recording(uuid,text,text,text) to authenticated;

create function public.claim_music_recording(p_worker uuid) returns public.music_recordings
language plpgsql security definer set search_path='' as $$
declare w public.music_workers; j public.music_recordings;
begin
 select * into w from public.music_workers where id=p_worker and revoked_at is null;
 if not found then raise exception 'Worker unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('music-worker:' || w.owner_id::text,0));
 update public.music_workers set last_seen=now(),ready=true where id=p_worker;
 -- A lost lease fails the attempt; it never silently regenerates/spends GPU.
 update public.music_recordings set status='failed',error='worker_interrupted',updated_at=now()
  where owner_id=w.owner_id and status='running' and lease_until<now();
 if exists(select 1 from public.music_recordings where owner_id=w.owner_id and status='running') then return null; end if;
 select * into j from public.music_recordings where owner_id=w.owner_id and status='queued'
  order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.music_recordings set status='running',worker_id=p_worker,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now()
  where id=j.id returning * into j;
 return j;
end $$;
revoke all on function public.claim_music_recording(uuid) from public,anon,authenticated;
grant execute on function public.claim_music_recording(uuid) to service_role;

create function public.heartbeat_music_worker(p_worker uuid,p_ready boolean,p_job uuid default null,p_lease uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.music_workers set last_seen=now(),ready=p_ready where id=p_worker and revoked_at is null;
 if not found then return false; end if;
 if p_job is not null then
  update public.music_recordings set lease_until=now()+interval '3 minutes',updated_at=now()
   where id=p_job and worker_id=p_worker and lease_id=p_lease and status in ('running','importing');
  if not found then return false; end if;
 end if;
 return true;
end $$;
revoke all on function public.heartbeat_music_worker(uuid,boolean,uuid,uuid) from public,anon,authenticated;
grant execute on function public.heartbeat_music_worker(uuid,boolean,uuid,uuid) to service_role;

create function public.reserve_legacy_recording(p_worker uuid,p_input jsonb) returns public.music_recordings
language plpgsql security definer set search_path='' as $$
declare w public.music_workers; j public.music_recordings; ident uuid:=(p_input->>'id')::uuid;
begin
 select * into w from public.music_workers where id=p_worker and revoked_at is null;
 if not found then raise exception 'Worker unavailable' using errcode='42501'; end if;
 if (p_input->>'owner_id')::uuid is distinct from w.owner_id then raise exception 'Owner mismatch' using errcode='42501'; end if;
 select * into j from public.music_recordings where id=ident for update;
 if found then
  if j.owner_id<>w.owner_id or j.origin<>'legacy' then raise exception 'Identifier in use' using errcode='23505'; end if;
  if j.status='importing' then
   update public.music_recordings set worker_id=p_worker,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=ident returning * into j;
  end if;
  return j;
 end if;
 insert into public.music_recordings(id,owner_id,worker_id,origin,status,moment,genre,kind,duration,lease_id,lease_until,created_at)
 values(ident,w.owner_id,p_worker,'legacy','importing',p_input->>'moment',p_input->>'genre',p_input->>'kind',(p_input->>'duration')::integer,
  gen_random_uuid(),now()+interval '3 minutes',to_timestamp((p_input->>'created_at')::double precision)) returning * into j;
 return j;
end $$;
revoke all on function public.reserve_legacy_recording(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_legacy_recording(uuid,jsonb) to service_role;

create function public.finish_music_recording(p_worker uuid,p_job uuid,p_lease uuid,p_result jsonb,p_failed boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.music_recordings; actual double precision;
begin
 select * into j from public.music_recordings where id=p_job and worker_id=p_worker and lease_id=p_lease for update;
 if not found then return false; end if;
 if j.status='completed' then return not p_failed; end if;
 if j.status='failed' then return p_failed; end if;
 if j.status not in ('running','importing') or not exists(select 1 from public.music_workers where id=p_worker and revoked_at is null) then return false; end if;
 if p_failed then
  update public.music_recordings set status='failed',error='generation_failed',updated_at=now() where id=p_job;
  return true;
 end if;
 actual:=(p_result->>'actual_duration')::double precision;
 if actual is null or actual='NaN'::double precision or actual<=0 or actual>605
  or (j.origin='cloud' and (actual<=180 or actual>245)) then raise exception 'Invalid recording duration' using errcode='22023'; end if;
 update public.music_recordings set status='completed',error=null,updated_at=now(),actual_duration=actual,
  audio_path=owner_id::text || '/' || id::text || '/track.mp3',lyrics=coalesce(p_result->>'lyrics',''),
  result_metadata=p_result-'lyrics' where id=p_job;
 return true;
end $$;
revoke all on function public.finish_music_recording(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finish_music_recording(uuid,uuid,uuid,jsonb,boolean) to service_role;

create function public.delete_music_recording(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); j public.music_recordings;
begin
 if uid is null or not public.is_song_administrator() then raise exception 'Administrator required' using errcode='42501'; end if;
 select * into j from public.music_recordings where id=p_id and owner_id=uid for update;
 if not found then return false; end if;
 if j.status in ('queued','running','importing') then raise exception 'Wait for recording to finish' using errcode='55000'; end if;
 update public.music_recordings set status='deleted',moment='',lyrics='',audio_path=null,result_metadata='{}',error=null,updated_at=now() where id=p_id;
 delete from public.playlist_items where owner_id=uid and source='generated' and generation_id=p_id;
 return true;
end $$;
revoke all on function public.delete_music_recording(uuid) from public,anon;
grant execute on function public.delete_music_recording(uuid) to authenticated;
commit;
