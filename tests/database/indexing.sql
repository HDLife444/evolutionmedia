\set ON_ERROR_STOP on
begin;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
insert into auth.users values
 ('851d2e86-8cc5-4a68-847a-5cd93070ac77'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into private.song_administrators(user_id) values
 ('851d2e86-8cc5-4a68-847a-5cd93070ac77'),('00000000-0000-0000-0000-000000000002');
insert into public.songs(id,owner_id,title,visibility) values
 ('30000000-0000-0000-0000-000000000001','851d2e86-8cc5-4a68-847a-5cd93070ac77','Collective confidence','collective'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Private confidence','private');
insert into public.song_ingestion_jobs(song_id,owner_id,status,storage_path,file_size,mime_type,sha256,submission)
 select id,owner_id,'queued',id::text,128,'audio/mpeg',repeat('a',64),'{}' from public.songs;
create temp table leases(song_id uuid primary key, token uuid, old_token uuid);
grant all on leases to authenticated;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.expect_failure(query text,expected text,label text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute query;
 exception when others then
  get stacked diagnostics actual=returned_sqlstate;
  if actual<>expected then raise exception '%: wrong error %, expected %',label,actual,expected; end if;
  raise notice 'PASS: %',label; return;
 end;
 raise exception '%: unexpectedly succeeded',label;
end $$;
create function pg_temp.fixture_embeddings() returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('modality','development','chunk_index',0,
 'chunk_text','Confidence and expression','embedding',to_jsonb(array[1::real] || array_fill(0::real,array[1535]))))
$$;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.expect_failure($q$select public.claim_song_indexing('30000000-0000-0000-0000-000000000001')$q$,'42501','ordinary user cannot claim indexing');
set local request.jwt.claim.sub='851d2e86-8cc5-4a68-847a-5cd93070ac77';
insert into leases(song_id,token,old_token)
select song_id,lease_token,lease_token from public.claim_song_indexing('30000000-0000-0000-0000-000000000001');
select pg_temp.expect_failure($q$select public.claim_song_indexing('30000000-0000-0000-0000-000000000001')$q$,'55000','active lease prevents duplicate processing');
select pg_temp.expect_failure($q$select public.finish_song_indexing('30000000-0000-0000-0000-000000000001',(select token from leases),jsonb_build_array(jsonb_build_object('modality','development','chunk_index',0,'chunk_text','bad','embedding',jsonb_build_array(1))))$q$,'22023','wrong dimensions rejected');
select pg_temp.assert_true((select count(*)=0 from public.song_embeddings),'failed validation leaves no partial vectors');
reset role;
update public.song_ingestion_jobs set lease_until=now()-interval '1 minute' where song_id='30000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='851d2e86-8cc5-4a68-847a-5cd93070ac77';
update leases set token=(select lease_token from public.claim_song_indexing('30000000-0000-0000-0000-000000000001'));
select pg_temp.expect_failure($q$select public.finish_song_indexing('30000000-0000-0000-0000-000000000001',(select old_token from leases),pg_temp.fixture_embeddings())$q$,'55000','stale worker cannot complete reclaimed job');
select public.fail_song_indexing('30000000-0000-0000-0000-000000000001',(select old_token from leases));
select pg_temp.assert_true((select status='processing' from public.song_ingestion_jobs),'stale failure cannot overwrite current processing');
select public.finish_song_indexing('30000000-0000-0000-0000-000000000001',(select token from leases),pg_temp.fixture_embeddings());
select pg_temp.assert_true((select status='searchable' from public.song_ingestion_jobs),'successful commit marks searchable');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select public.finish_song_indexing('30000000-0000-0000-0000-000000000002',
 (select lease_token from public.claim_song_indexing('30000000-0000-0000-0000-000000000002')),pg_temp.fixture_embeddings());
select pg_temp.assert_true((select count(*)=2 from public.search_song_text((array[1::real]||array_fill(0::real,array[1535]))::extensions.vector)),'owner can search own private and collective song');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=1 from public.search_song_text((array[1::real]||array_fill(0::real,array[1535]))::extensions.vector)),'semantic search excludes another user private song');
select pg_temp.assert_true((select similarity > 0.99 from public.search_song_text((array[1::real]||array_fill(0::real,array[1535]))::extensions.vector)),'known vector match has expected similarity');
reset role;
insert into public.song_embeddings(song_id,modality,model_name,chunk_index,embedding)
 values('30000000-0000-0000-0000-000000000001','lyrics','unrelated-model',0,
 (array[1::real]||array_fill(0::real,array[1535]))::extensions.vector);
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=1 from public.search_song_text((array[1::real]||array_fill(0::real,array[1535]))::extensions.vector)),'search isolates the configured embedding model');
set local role anon;
select pg_temp.expect_failure($q$select * from public.search_song_text((array[1::real]||array_fill(0::real,array[1535]))::extensions.vector)$q$,'42501','anonymous vector search denied');
rollback;
