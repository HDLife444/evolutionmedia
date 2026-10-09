\set ON_ERROR_STOP on
begin;
-- Match Supabase's application table privileges; RLS must enforce isolation.
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
insert into auth.users(id) values
 ('851d2e86-8cc5-4a68-847a-5cd93070ac77'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into private.song_administrators(user_id) values
 ('851d2e86-8cc5-4a68-847a-5cd93070ac77'),
 ('00000000-0000-0000-0000-000000000002');
create function pg_temp.expect_failure(query text, expected text, label text)
returns void language plpgsql as $$
declare actual text;
begin
 begin
  execute query;
 exception when others then
  get stacked diagnostics actual = returned_sqlstate;
  if actual <> expected then raise exception '%: wrong error %, expected %', label, actual, expected; end if;
  raise notice 'PASS: %', label;
  return;
 end;
 raise exception '%: unexpectedly succeeded', label;
end $$;
create function pg_temp.assert_true(value boolean, label text)
returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'FAIL: %', label; end if;
 raise notice 'PASS: %', label;
end $$;
create function pg_temp.submission(visibility text default 'collective') returns jsonb
language sql as $$ select jsonb_build_object(
 'title','Foundational song', 'description','A confidence song', 'lyrics','I find my voice',
 'development_goal','Confidence', 'emotional_progression','Uncertainty to expression',
 'origin_provider','test', 'provenance','Synthetic owned test fixture',
 'genre',jsonb_build_array('anthem'), 'mood',jsonb_build_array('uplifting'),
 'visibility',visibility, 'rights_confirmed',true, 'collective_consent',true,
 'reuse_allowed',false, 'file_size',128, 'mime_type','audio/mpeg', 'sha256',repeat('a',64)) $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(not public.is_song_administrator(), 'ordinary user has no administrator role');
select pg_temp.expect_failure($q$select public.begin_song_ingestion('20000000-0000-0000-0000-000000000001',pg_temp.submission())$q$,'42501','ordinary user cannot create ingestion');
select pg_temp.expect_failure($q$insert into private.song_administrators(user_id) values(auth.uid())$q$,'42501','ordinary user cannot self-promote');

set local request.jwt.claim.sub = '851d2e86-8cc5-4a68-847a-5cd93070ac77';
select pg_temp.assert_true(public.is_song_administrator(), 'designated user is administrator');
select pg_temp.expect_failure($q$select public.begin_song_ingestion('20000000-0000-0000-0000-000000000099',pg_temp.submission() || '{"collective_consent":false}')$q$,'22023','collective sharing requires consent');
select pg_temp.expect_failure($q$select public.begin_song_ingestion('20000000-0000-0000-0000-000000000099',pg_temp.submission() || '{"rights_confirmed":false}')$q$,'22023','upload requires rights confirmation');
select pg_temp.expect_failure($q$select public.begin_song_ingestion('20000000-0000-0000-0000-000000000099',pg_temp.submission() || '{"file_size":52428801}')$q$,'22023','oversized audio rejected');
select public.begin_song_ingestion('20000000-0000-0000-0000-000000000001',pg_temp.submission());
select public.begin_song_ingestion('20000000-0000-0000-0000-000000000001',pg_temp.submission());
select pg_temp.assert_true((select count(*)=1 from public.song_ingestion_jobs),'registration retry is idempotent');
select pg_temp.assert_true((select visibility='private' from public.songs where id='20000000-0000-0000-0000-000000000001'),'unfinished song remains private');
select pg_temp.expect_failure($q$select public.complete_song_ingestion('20000000-0000-0000-0000-000000000001')$q$,'22023','cannot finalize missing audio');
select pg_temp.expect_failure($q$insert into storage.objects(bucket_id,name) values('song-assets','wrong/path.mp3')$q$,'42501','cannot upload outside reservation');
insert into storage.objects(bucket_id,name,metadata)
select 'song-assets',storage_path,'{"size":128,"mimetype":"audio/mpeg"}' from public.song_ingestion_jobs;
select public.complete_song_ingestion('20000000-0000-0000-0000-000000000001');
select public.complete_song_ingestion('20000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*)=1 from public.song_assets),'completion retry creates exactly one asset');
select pg_temp.assert_true((select status='queued' from public.song_ingestion_jobs),'upload queues indexing without claiming searchable');
with changed as (
 update public.song_ingestion_jobs set status='searchable' returning song_id
)
select pg_temp.assert_true((select count(*)=0 from changed),'administrator cannot directly mark songs searchable');
select pg_temp.assert_true((select visibility='collective' from public.songs where id='20000000-0000-0000-0000-000000000001'),'collective visibility applied only after audio verified');
select pg_temp.assert_true((select count(*)=0 from public.song_embeddings),'no fabricated embeddings');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'administrator can read own audio');

select public.begin_song_ingestion('20000000-0000-0000-0000-000000000002',pg_temp.submission('private'));
insert into storage.objects(bucket_id,name,metadata)
select 'song-assets',storage_path,'{"size":128,"mimetype":"audio/mpeg"}' from public.song_ingestion_jobs where status='awaiting_upload';
select public.complete_song_ingestion('20000000-0000-0000-0000-000000000002');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select count(*)=0 from public.song_ingestion_jobs),'another administrator cannot see owner-only ingestion evidence');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'another administrator reads collective audio but not private audio');
select pg_temp.expect_failure($q$select public.complete_song_ingestion('20000000-0000-0000-0000-000000000001')$q$,'42501','another administrator cannot finalize another owner upload');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=0 from public.song_ingestion_jobs),'ordinary user cannot read ingestion evidence');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'ordinary listener can read collective audio only');
select pg_temp.assert_true((select count(*)=1 from public.songs),'ordinary user sees only completed collective song');
select pg_temp.expect_failure($q$select public.complete_song_ingestion('20000000-0000-0000-0000-000000000001')$q$,'42501','ordinary user cannot finalize upload');
select pg_temp.expect_failure($q$insert into storage.objects(bucket_id,name) values('song-assets','unauthorized.mp3')$q$,'42501','ordinary user cannot upload');

set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.assert_true((select count(*)=1 from public.songs),'public landing catalog excludes private song');
select pg_temp.assert_true((select count(*)=1 from public.song_assets),'public asset lookup excludes private song');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'public listeners can access collective audio only');
select pg_temp.assert_true((select count(*)=0 from public.song_ingestion_jobs),'public visitors cannot read provenance or ingestion records');
select pg_temp.expect_failure($q$insert into storage.objects(bucket_id,name) values('song-assets','public-upload.mp3')$q$,'42501','public visitors cannot upload');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"title":"Hacked"}')$q$,'42501','ordinary listener cannot edit');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"title":"Hacked"}')$q$,'42501','other administrator cannot edit');
reset role;
insert into public.song_embeddings(song_id,modality,model_name,embedding)
values('20000000-0000-0000-0000-000000000001','lyrics','openai/text-embedding-3-small/1536/v1',
 (array[1::real] || array_fill(0::real,array[1535]))::extensions.vector);
update public.song_ingestion_jobs set status='searchable' where song_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '851d2e86-8cc5-4a68-847a-5cd93070ac77';
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"storage_path":"bad"}')$q$,'22023','edit cannot change storage identity');
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"collective_consent":false}')$q$,'22023','edit requires collective consent');
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"genre":[4]}')$q$,'22023','edit rejects nonstring tags');
select public.update_ingested_song('20000000-0000-0000-0000-000000000001',
 (select updated_at from public.song_ingestion_jobs where song_id='20000000-0000-0000-0000-000000000001'),
 '{"title":"Updated song","lyrics":"New words","visibility":"private"}');
select pg_temp.assert_true((select title='Updated song' and lyrics='New words' and visibility='private' from public.songs where id='20000000-0000-0000-0000-000000000001'),'edit updates catalog');
select pg_temp.assert_true((select submission->>'lyrics'='New words' and status='queued' and lease_token is null from public.song_ingestion_jobs where song_id='20000000-0000-0000-0000-000000000001'),'edit updates indexing input and requeues');
select pg_temp.assert_true((select count(*)=0 from public.song_embeddings),'edit removes stale text vectors');
select pg_temp.assert_true((select count(*)=2 from public.song_assets),'edit preserves recordings');
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"title":"Stale"}')$q$,'40001','stale editor rejected');
reset role;
update public.song_ingestion_jobs set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' where song_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '851d2e86-8cc5-4a68-847a-5cd93070ac77';
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',(select updated_at from public.song_ingestion_jobs where song_id='20000000-0000-0000-0000-000000000001'),'{"title":"Busy"}')$q$,'55000','active worker blocks edit');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=0 from storage.objects),'making collective song private revokes listener storage access');
set local role anon;
select pg_temp.assert_true((select count(*)=0 from storage.objects),'public playback revoked after song made private');
select pg_temp.expect_failure($q$select public.update_ingested_song('20000000-0000-0000-0000-000000000001',now(),'{"title":"Anonymous"}')$q$,'42501','anonymous edits denied');
reset role;
select pg_temp.assert_true((select not public from storage.buckets where id='song-assets'),'audio bucket remains private');
rollback;
