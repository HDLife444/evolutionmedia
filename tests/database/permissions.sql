\set ON_ERROR_STOP on
begin;
-- Emulate the table grants: RLS must protect writes even when privileges exist.
grant select, insert, update, delete on all tables in schema public to authenticated, anon;

insert into auth.users values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002');
insert into public.songs (id, owner_id, title, visibility) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Collective', 'collective'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Private A', 'private'),
 ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Private B', 'private');
insert into public.song_assets (song_id, asset_type, storage_path)
 select id, 'audio', id::text || '/song.wav' from public.songs;
insert into public.song_embeddings (song_id, modality, model_name, embedding)
 select id, 'lyrics', 'synthetic-test-only', array_fill(0.1::real, array[1536])::extensions.vector
 from public.songs;
insert into public.song_lineage (parent_song_id, child_song_id, relationship) values
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','retrieved'),
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','retrieved'),
 ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','retrieved');
insert into public.generation_jobs (owner_id, engine)
 select id, 'test' from auth.users;
insert into public.song_feedback (song_id, user_id, rating)
 select '10000000-0000-0000-0000-000000000001', id, 5 from auth.users;

create function pg_temp.assert_count(query text, expected bigint, label text)
 returns void language plpgsql as $$
declare actual bigint;
begin
 execute query into actual;
 if actual <> expected then
  raise exception '%: expected %, got %', label, expected, actual;
 end if;
 raise notice 'PASS: %', label;
end $$;

select pg_temp.assert_count(
 'select count(*) from pg_class where oid in (''public.songs''::regclass,
 ''public.song_assets''::regclass, ''public.song_embeddings''::regclass,
 ''public.song_lineage''::regclass, ''public.generation_jobs''::regclass,
 ''public.song_feedback''::regclass) and relrowsecurity', 6, 'RLS enabled on all six tables');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.assert_count('select count(*) from public.songs', 2, 'A sees collective and own private song');
select pg_temp.assert_count('select count(*) from public.songs where title = ''Private B''', 0, 'A cannot see B private song');
select pg_temp.assert_count('select count(*) from public.song_assets', 2, 'A asset isolation');
select pg_temp.assert_count('select count(*) from public.song_embeddings', 2, 'A embedding isolation');
select pg_temp.assert_count('select count(*) from public.song_lineage', 1, 'A lineage hides inaccessible endpoints');
select pg_temp.assert_count('select count(*) from public.generation_jobs', 1, 'A job isolation');
select pg_temp.assert_count('select count(*) from public.song_feedback', 1, 'A feedback isolation');
select pg_temp.assert_count('select count(*) from public.song_embeddings where extensions.vector_dims(embedding) = 1536', 2, '1536-dimensional vector storage');

-- No SELECT test alone can establish that writes are server-only.
do $$
declare target text; affected bigint;
begin
 foreach target in array array['songs','song_assets','song_embeddings','song_lineage','generation_jobs','song_feedback'] loop
  execute format('update public.%I set created_at = created_at', target);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Authenticated update allowed on %', target; end if;
  execute format('delete from public.%I', target);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Authenticated delete allowed on %', target; end if;
 end loop;
 begin
  insert into public.songs (title, owner_id) values ('Forbidden', auth.uid());
  raise exception 'Authenticated insert was allowed';
 exception when insufficient_privilege then
  raise notice 'PASS: authenticated insert denied';
 end;
 raise notice 'PASS: authenticated updates/deletes denied across all six tables';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.assert_count('select count(*) from public.songs', 2, 'B sees collective and own private song');
select pg_temp.assert_count('select count(*) from public.songs where title = ''Private A''', 0, 'B cannot see A private song');
select pg_temp.assert_count('select count(*) from public.song_assets', 2, 'B asset isolation');
select pg_temp.assert_count('select count(*) from public.song_embeddings', 2, 'B embedding isolation');
select pg_temp.assert_count('select count(*) from public.song_lineage', 1, 'B lineage hides inaccessible endpoints');
select pg_temp.assert_count('select count(*) from public.generation_jobs', 1, 'B job isolation');
select pg_temp.assert_count('select count(*) from public.song_feedback', 1, 'B feedback isolation');

set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.assert_count('select count(*) from public.songs', 1, 'anonymous catalog shows collective only');
select pg_temp.assert_count('select count(*) from public.song_assets', 1, 'anonymous audio assets show collective only');
select pg_temp.assert_count('select count(*) from public.song_embeddings', 0, 'anonymous embedding access denied');
select pg_temp.assert_count('select count(*) from public.song_lineage', 0, 'anonymous lineage access denied');
select pg_temp.assert_count('select count(*) from public.generation_jobs', 0, 'anonymous job access denied');
select pg_temp.assert_count('select count(*) from public.song_feedback', 0, 'anonymous feedback access denied');
do $$
declare target text; affected bigint;
begin
 foreach target in array array['songs','song_assets','song_embeddings','song_lineage','generation_jobs','song_feedback'] loop
  execute format('update public.%I set created_at = created_at', target);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Anonymous update allowed on %', target; end if;
  execute format('delete from public.%I', target);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Anonymous delete allowed on %', target; end if;
 end loop;
 begin
  insert into public.songs (title) values ('Forbidden public song');
  raise exception 'Anonymous insert was allowed';
 exception when insufficient_privilege then raise notice 'PASS: anonymous insert denied';
 end;
 raise notice 'PASS: public catalog remains read-only across all six tables';
end $$;
rollback;
