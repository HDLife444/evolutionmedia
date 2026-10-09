-- Collective now means public discovery and listening. Private songs remain
-- owner-only. The audio bucket itself remains private with expiring URLs.
begin;
grant select on public.songs, public.song_assets to anon;
create policy public_collective_songs_read on public.songs for select to anon
 using (visibility = 'collective');
create policy public_collective_audio_assets_read on public.song_assets for select to anon
 using (asset_type = 'audio' and exists (
  select 1 from public.songs s where s.id = song_id and s.visibility = 'collective'
 ));
create policy public_collective_audio_read on storage.objects for select to anon
 using (bucket_id = 'song-assets' and exists (
  select 1 from public.song_assets a join public.songs s on s.id = a.song_id
  where a.storage_path = name and a.asset_type = 'audio' and s.visibility = 'collective'
 ));
commit;
