\set ON_ERROR_STOP on
begin;
-- Supabase grants catalog SELECT separately; earlier test transactions roll
-- back their stand-in grants before this isolated playlist check starts.
grant select on public.songs to authenticated;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.expect_failure(statement text, code text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate = code then raise notice 'PASS: %', label; return; end if;
  raise exception 'Unexpected SQLSTATE % for %', sqlstate, label;
 end;
 raise exception 'FAIL: % was allowed', label;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.songs(id,owner_id,title,visibility) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Shared song','collective'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Private B','private');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.playlists(id,name) values ('40000000-0000-0000-0000-000000000001',' My chapter ');
select pg_temp.assert_true((select name='My chapter' from public.playlists),'owner creates and trims playlist');
select pg_temp.expect_failure($q$insert into public.playlists(owner_id,name) values('00000000-0000-0000-0000-000000000002','Forged')$q$,'42501','owner cannot forge another owner');
insert into public.playlist_items(id,playlist_id,source,song_id,title) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','catalog','30000000-0000-0000-0000-000000000001','Shared song');
insert into public.playlist_items(id,playlist_id,source,generation_id,title) values
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','generated','60000000-0000-0000-0000-000000000001','Custom song');
select pg_temp.assert_true((select count(*)=2 from public.playlist_items),'both catalog and generated references are saved');
select pg_temp.expect_failure($q$insert into public.playlist_items(playlist_id,source,song_id,title) values('40000000-0000-0000-0000-000000000001','catalog','30000000-0000-0000-0000-000000000002','Private B')$q$,'42501','cannot save inaccessible private song');
select pg_temp.expect_failure($q$update public.playlist_items set generation_id=gen_random_uuid() where id='50000000-0000-0000-0000-000000000002'$q$,'22023','saved track identity is immutable');
select pg_temp.expect_failure($q$insert into public.playlist_items(playlist_id,source,generation_id,title) values('40000000-0000-0000-0000-000000000001','generated','60000000-0000-0000-0000-000000000001','Duplicate')$q$,'23505','same track cannot be duplicated');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select count(*)=0 from public.playlists),'other user cannot see playlist');
select pg_temp.assert_true((select count(*)=0 from public.playlist_items),'other user cannot see track titles or references');
select pg_temp.expect_failure($q$insert into public.playlist_items(playlist_id,source,generation_id,title) values('40000000-0000-0000-0000-000000000001','generated',gen_random_uuid(),'Forged')$q$,'42501','other user cannot add to playlist');
update public.playlists set name='Hacked';
delete from public.playlists;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select name='My chapter' from public.playlists),'cross-owner update and deletion do not affect playlist');

reset role;
update public.songs set visibility='private' where id='30000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.playlist_items),'catalog privacy revocation hides saved metadata');
delete from public.playlist_items where source='generated';
delete from public.playlists;
reset role;
select pg_temp.assert_true((select count(*)=0 from public.playlist_items),'playlist deletion cascades entries');
select pg_temp.assert_true((select count(*)=2 from public.songs),'removing playlist and entries preserves original songs');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.playlists(name) select 'Playlist ' || n from generate_series(1,50) n;
select pg_temp.expect_failure($q$insert into public.playlists(name) values('Over limit')$q$,'54000','account playlist limit enforced in database');
delete from public.playlists;
insert into public.playlists(id,name) values ('40000000-0000-0000-0000-000000000001','Capacity');
insert into public.playlist_items(playlist_id,source,generation_id,title)
 select '40000000-0000-0000-0000-000000000001','generated',gen_random_uuid(),'Track ' || n from generate_series(1,200) n;
select pg_temp.expect_failure($q$insert into public.playlist_items(playlist_id,source,generation_id,title) values('40000000-0000-0000-0000-000000000001','generated',gen_random_uuid(),'Over limit')$q$,'54000','playlist track limit enforced in database');
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.expect_failure('select * from public.playlists','42501','anonymous playlist reads denied');
select pg_temp.expect_failure('select * from public.playlist_items','42501','anonymous playlist item reads denied');
rollback;
