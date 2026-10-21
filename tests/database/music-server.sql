\set ON_ERROR_STOP on
begin;
-- Hosted Supabase already grants catalog SELECT; other tests roll it back.
grant select on public.songs, public.song_assets to authenticated;
create function pg_temp.ok(test boolean,label text) returns void language plpgsql as $$
begin if test is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.denied(statement text,expected text,label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate=expected then raise notice 'PASS: %',label; return; end if;
  raise exception 'Unexpected % for %',sqlstate,label;
 end;
 raise exception 'FAIL: %',label;
end $$;
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into private.song_administrators(user_id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role service_role;
select (public.register_music_worker('00000000-0000-0000-0000-000000000001',repeat('a',64))).id as worker_a \gset
select (public.register_music_worker('00000000-0000-0000-0000-000000000002',repeat('b',64))).id as worker_b \gset
select public.heartbeat_music_worker(:'worker_a',true);
select public.heartbeat_music_worker(:'worker_b',true);
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.denied($q$select public.enqueue_music_recording(gen_random_uuid(),'Focus','soul','vocal')$q$,'42501','ordinary listener cannot spend GPU');
select pg_temp.denied('select * from public.music_workers','42501','worker hashes cannot be read by signed-in users');
select pg_temp.denied($q$select public.claim_music_recording(gen_random_uuid())$q$,'42501','signed-in user cannot impersonate worker');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.enqueue_music_recording('70000000-0000-0000-0000-000000000001','Focus','soul','vocal');
select public.enqueue_music_recording('70000000-0000-0000-0000-000000000001','Focus','soul','vocal');
select pg_temp.ok((select count(*)=1 and min(duration)=240 from public.music_recordings),'enqueue is idempotent and always four minutes');
select pg_temp.denied($q$select public.enqueue_music_recording('70000000-0000-0000-0000-000000000001','Different','soul','vocal')$q$,'23505','changed input cannot reuse identifier');
select pg_temp.denied($q$insert into public.music_recordings(id,owner_id,status,moment,genre,kind,duration) values(gen_random_uuid(),auth.uid(),'queued','Bypass','soul','vocal',30)$q$,'42501','browser cannot bypass queue policy');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*)=0 from public.music_recordings),'other owner cannot read queue or lyrics');
select pg_temp.denied($q$select public.enqueue_music_recording('70000000-0000-0000-0000-000000000001','Focus','soul','vocal')$q$,'23505','cross-owner ID cannot be adopted');
set local role service_role;
select id,lease_id from public.claim_music_recording(:'worker_a') \gset claimed_
select pg_temp.ok(:'claimed_id'='70000000-0000-0000-0000-000000000001','correct worker claims owner recording');
select pg_temp.ok((public.claim_music_recording(:'worker_a')).id is null,'second claim cannot duplicate active GPU work');
select pg_temp.ok((public.claim_music_recording(:'worker_b')).id is null,'other worker has no access to owner queue');
select pg_temp.ok(not public.finish_music_recording(:'worker_b',:'claimed_id',:'claimed_lease_id','{"lyrics":"Foreign","actual_duration":240}'),'other worker cannot complete recording');
select pg_temp.ok(not public.heartbeat_music_worker(:'worker_b',true,:'claimed_id',:'claimed_lease_id'),'other worker cannot renew lease');
reset role;
select pg_temp.denied(format('select public.finish_music_recording(%L,%L,%L,%L)',:'worker_a',:'claimed_id',:'claimed_lease_id','{"lyrics":"Short","actual_duration":90}'),'22023','short new audio cannot become completed');
set local role service_role;
select pg_temp.ok(public.finish_music_recording(:'worker_a',:'claimed_id',:'claimed_lease_id','{"lyrics":"Full lyrics","actual_duration":240.02}'),'full-length recording completed');
select pg_temp.ok(public.finish_music_recording(:'worker_a',:'claimed_id',:'claimed_lease_id','{"lyrics":"Full lyrics","actual_duration":240.02}'),'lost completion reply can be retried');
select pg_temp.ok(not public.finish_music_recording(:'worker_a',:'claimed_id',:'claimed_lease_id','{}',true),'completed recording cannot be replaced by failure');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.enqueue_music_recording('70000000-0000-0000-0000-000000000002','Focus','soul','instrumental');
set local role service_role;
select id,lease_id from public.claim_music_recording(:'worker_a') \gset interrupted_
reset role;
update public.music_recordings set lease_until=now()-interval '1 second' where id=:'interrupted_id';
set local role service_role;
select pg_temp.ok((public.claim_music_recording(:'worker_a')).id is null,'expired job is not automatically regenerated');
select pg_temp.ok((select status='failed' from public.music_recordings where id=:'interrupted_id'),'interruption is retained as failure');
select id,lease_id from public.reserve_legacy_recording(:'worker_a','{"id":"70000000-0000-0000-0000-000000000003","owner_id":"00000000-0000-0000-0000-000000000001","moment":"Old test","genre":"soul","kind":"instrumental","duration":30,"created_at":1700000000}') \gset legacy_
select pg_temp.ok(public.finish_music_recording(:'worker_a',:'legacy_id',:'legacy_lease_id','{"lyrics":"","actual_duration":30}'),'old short test recording can be preserved without regenerating it');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.playlists(id,name) values('80000000-0000-0000-0000-000000000001','Private music');
insert into public.playlist_items(playlist_id,source,generation_id,title) values('80000000-0000-0000-0000-000000000001','generated',:'claimed_id','A full song');
select pg_temp.ok(public.delete_music_recording(:'claimed_id'),'owner deletes completed recording');
select pg_temp.ok(public.delete_music_recording(:'claimed_id'),'deletion retry is safe');
select pg_temp.ok((select count(*)=0 from public.playlist_items),'deletion removes saved playlist references');
select pg_temp.denied(format('select public.enqueue_music_recording(%L,%L,%L,%L)',:'claimed_id','Focus','soul','vocal'),'23505','deleted ID never regenerates');
reset role;
select pg_temp.ok((select moment='' and lyrics='' and result_metadata='{}' and audio_path is null from public.music_recordings where id=:'claimed_id'),'deletion clears private content but retains minimal identity');
insert into storage.objects(bucket_id,name) values('generated-music','00000000-0000-0000-0000-000000000001/private/track.mp3');
set local role authenticated;
select pg_temp.ok((select count(*)=0 from storage.objects),'direct signed-in storage reads do not expose generated recordings');
select public.enqueue_music_recording(gen_random_uuid(),'Focus','soul','instrumental') from generate_series(1,3);
select pg_temp.denied($q$select public.enqueue_music_recording(gen_random_uuid(),'Extra','soul','vocal')$q$,'54000','queue capacity enforced atomically');
reset role;
update public.music_recordings set status='failed' where status='queued';
set local role authenticated;
select public.enqueue_music_recording(gen_random_uuid(),'Sixth','soul','instrumental');
select pg_temp.denied($q$select public.enqueue_music_recording(gen_random_uuid(),'Seventh','soul','vocal')$q$,'54000','deletion cannot bypass recent generation limit');
set local role anon;
set local request.jwt.claim.sub='';
select pg_temp.denied('select * from public.music_recordings','42501','anonymous queue reads denied');
select pg_temp.denied('select * from public.music_workers','42501','anonymous worker secrets denied');
select pg_temp.ok((select count(*)=0 from storage.objects),'anonymous generated audio access denied');
reset role;
select pg_temp.ok((select not public from storage.buckets where id='generated-music'),'recording bucket stays private');
rollback;
