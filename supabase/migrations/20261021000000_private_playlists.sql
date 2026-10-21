-- Private, per-account playlists. Apply once after the existing migrations.
begin;

create table public.playlists (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id, owner_id)
);

create table public.playlist_items (
 id uuid primary key default gen_random_uuid(),
 playlist_id uuid not null,
 owner_id uuid not null default auth.uid(),
 source text not null check (source in ('catalog','generated')),
 song_id uuid references public.songs(id) on delete cascade,
 generation_id uuid,
 title text not null check (char_length(btrim(title)) between 1 and 160),
 created_at timestamptz not null default now(),
 foreign key (playlist_id, owner_id) references public.playlists(id, owner_id) on delete cascade,
 check ((source = 'catalog' and song_id is not null and generation_id is null)
     or (source = 'generated' and generation_id is not null and song_id is null)),
 unique(playlist_id, song_id),
 unique(playlist_id, generation_id)
);
create index playlists_owner_updated on public.playlists(owner_id, updated_at desc);
create index playlist_items_order on public.playlist_items(playlist_id, created_at, id);
create index playlist_items_generated_owner on public.playlist_items(owner_id, generation_id)
 where source = 'generated';

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
revoke all on public.playlists, public.playlist_items from public, anon;
grant select, insert, update, delete on public.playlists, public.playlist_items to authenticated;

create policy playlists_owner_read on public.playlists for select to authenticated
 using(owner_id = (select auth.uid()));
create policy playlists_owner_insert on public.playlists for insert to authenticated
 with check(owner_id = (select auth.uid()));
create policy playlists_owner_update on public.playlists for update to authenticated
 using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
create policy playlists_owner_delete on public.playlists for delete to authenticated
 using(owner_id = (select auth.uid()));

-- Catalog access remains live: making a song private also hides saved metadata
-- from listeners who no longer have access. Playlist membership grants no audio
-- access and never makes a private song collective.
create policy playlist_items_owner_read on public.playlist_items for select to authenticated
 using(owner_id = (select auth.uid()) and (source = 'generated' or exists(
  select 1 from public.songs s where s.id = song_id
    and (s.visibility = 'collective' or s.owner_id = (select auth.uid()))
 )));
create policy playlist_items_owner_insert on public.playlist_items for insert to authenticated
 with check(owner_id = (select auth.uid()));
create policy playlist_items_owner_update on public.playlist_items for update to authenticated
 using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
create policy playlist_items_owner_delete on public.playlist_items for delete to authenticated
 using(owner_id = (select auth.uid()));

-- Serialize capacity checks in PostgreSQL, including direct REST writes. The
-- definer functions explicitly verify auth.uid()/ownership before touching data.
-- Generated IDs refer to Lambda jobs, not Supabase generation_jobs; the web API
-- additionally verifies completed, owner-scoped worker status before saving one.
create function public.guard_private_playlist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or new.owner_id <> v_uid
  or (tg_op = 'UPDATE' and old.owner_id <> v_uid) then
  raise exception 'Playlist unavailable' using errcode = '42501';
 end if;
 if tg_op = 'UPDATE' and (new.id <> old.id or new.owner_id <> old.owner_id) then
  raise exception 'Playlist identity cannot change' using errcode = '22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playlist-owner:' || v_uid::text, 0));
 if tg_op = 'INSERT' and (select count(*) from public.playlists where owner_id = v_uid) >= 50 then
  raise exception 'Playlist limit reached' using errcode = '54000';
 end if;
 new.name := btrim(new.name);
 if tg_op = 'UPDATE' then new.updated_at := clock_timestamp(); end if;
 return new;
end $$;
revoke all on function public.guard_private_playlist() from public, anon, authenticated;
create trigger guard_private_playlist before insert or update on public.playlists
 for each row execute function public.guard_private_playlist();

create function public.guard_private_playlist_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or new.owner_id <> v_uid
  or not exists(select 1 from public.playlists p where p.id = new.playlist_id and p.owner_id = v_uid) then
  raise exception 'Playlist unavailable' using errcode = '42501';
 end if;
 if tg_op = 'UPDATE' and (old.owner_id <> v_uid or new.id <> old.id
  or new.owner_id <> old.owner_id or new.playlist_id <> old.playlist_id
  or new.source <> old.source or new.song_id is distinct from old.song_id
  or new.generation_id is distinct from old.generation_id) then
  raise exception 'Playlist item identity cannot change' using errcode = '22023';
 end if;
 if new.source = 'catalog' and not exists(select 1 from public.songs s
  where s.id = new.song_id and (s.visibility = 'collective' or s.owner_id = v_uid)) then
  raise exception 'Song unavailable' using errcode = '42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('playlist-items:' || new.playlist_id::text, 0));
 if tg_op = 'INSERT' and (select count(*) from public.playlist_items where playlist_id = new.playlist_id) >= 200 then
  raise exception 'Playlist track limit reached' using errcode = '54000';
 end if;
 new.title := btrim(new.title);
 return new;
end $$;
revoke all on function public.guard_private_playlist_item() from public, anon, authenticated;
create trigger guard_private_playlist_item before insert or update on public.playlist_items
 for each row execute function public.guard_private_playlist_item();

create function public.touch_private_playlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 update public.playlists set updated_at = clock_timestamp()
  where id = case when tg_op = 'DELETE' then old.playlist_id else new.playlist_id end
    and owner_id = auth.uid();
 return null;
end $$;
revoke all on function public.touch_private_playlist() from public, anon, authenticated;
create trigger touch_private_playlist after insert or update or delete on public.playlist_items
 for each row execute function public.touch_private_playlist();

commit;
