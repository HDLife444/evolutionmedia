-- Apply after text_indexing.sql. Audio stays private; access follows catalog RLS.
begin;
create policy library_song_audio_read on storage.objects for select to authenticated
 using (bucket_id = 'song-assets' and exists (
  select 1 from public.song_assets a join public.songs s on s.id = a.song_id
  where a.storage_path = name and a.asset_type = 'audio'
    and (s.visibility = 'collective' or s.owner_id = (select auth.uid()))
 ));

create function public.update_ingested_song(p_song_id uuid, p_updated_at timestamptz, p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.song_ingestion_jobs; v jsonb; field text; tag jsonb;
begin
 if auth.uid() is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode = '42501';
 end if;
 select * into j from public.song_ingestion_jobs
  where song_id = p_song_id and owner_id = auth.uid() for update;
 if not found then raise exception 'Song unavailable' using errcode = '42501'; end if;
 if j.updated_at is distinct from p_updated_at then
  raise exception 'Song changed; reload before editing' using errcode = '40001';
 end if;
 if j.status = 'awaiting_upload' or (j.status = 'processing' and j.lease_until > now()) then
  raise exception 'Finish upload or indexing before editing' using errcode = '55000';
 end if;
 if jsonb_typeof(p_changes) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_changes) k where k not in
  ('title','description','lyrics','development_goal','emotional_progression','origin_provider','provenance',
   'genre','mood','visibility','rights_confirmed','collective_consent','reuse_allowed')) then
  raise exception 'Invalid edit fields' using errcode = '22023';
 end if;
 v := j.submission || p_changes;
 foreach field in array array['title','description','lyrics','development_goal','emotional_progression','origin_provider','provenance'] loop
  if jsonb_typeof(v->field) is distinct from 'string' then
   raise exception 'Invalid text field' using errcode = '22023';
  end if;
 end loop;
 if length(trim(v->>'title')) not between 1 and 200
  or length(v->>'description') > 5000 or length(v->>'lyrics') > 50000
  or length(trim(v->>'development_goal')) not between 1 and 1000
  or length(trim(v->>'emotional_progression')) not between 1 and 1000
  or length(trim(v->>'origin_provider')) not between 1 and 100
  or length(trim(v->>'provenance')) not between 1 and 2000
  or jsonb_typeof(v->'genre') is distinct from 'array'
  or jsonb_typeof(v->'mood') is distinct from 'array'
  or jsonb_typeof(v->'rights_confirmed') is distinct from 'boolean'
  or jsonb_typeof(v->'collective_consent') is distinct from 'boolean'
  or jsonb_typeof(v->'reuse_allowed') is distinct from 'boolean'
  or (v->>'rights_confirmed') <> 'true'
  or coalesce(v->>'visibility','') not in ('private','collective')
  or ((v->>'visibility') = 'collective' and (v->>'collective_consent') <> 'true') then
  raise exception 'Invalid metadata or sharing consent' using errcode = '22023';
 end if;
 if jsonb_array_length(v->'genre') > 10 or jsonb_array_length(v->'mood') > 10 then
  raise exception 'Too many tags' using errcode = '22023';
 end if;
 for tag in select value from jsonb_array_elements((v->'genre') || (v->'mood')) loop
  if jsonb_typeof(tag) <> 'string' or length(trim(tag #>> '{}')) not between 1 and 80 then
   raise exception 'Invalid tag' using errcode = '22023';
  end if;
 end loop;
 if v = j.submission then return; end if;
 update public.songs set title = trim(v->>'title'), description = v->>'description', lyrics = v->>'lyrics',
  origin_provider = trim(v->>'origin_provider'), visibility = v->>'visibility',
  reuse_allowed = (v->>'reuse_allowed')::boolean,
  genre = array(select jsonb_array_elements_text(v->'genre')),
  mood = array(select jsonb_array_elements_text(v->'mood')),
  metadata = metadata || jsonb_build_object('development_goal',v->>'development_goal',
   'emotional_progression',v->>'emotional_progression'), updated_at = clock_timestamp()
  where id = p_song_id and owner_id = auth.uid();
 -- Remove outdated meaning and revoke expired workers' leases atomically.
 delete from public.song_embeddings where song_id = p_song_id
  and model_name = 'openai/text-embedding-3-small/1536/v1';
 update public.song_ingestion_jobs set submission = v, status = 'queued', lease_token = null,
  lease_until = null, last_error = null, updated_at = clock_timestamp() where song_id = p_song_id;
end $$;
revoke all on function public.update_ingested_song(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.update_ingested_song(uuid,timestamptz,jsonb) to authenticated;
commit;
