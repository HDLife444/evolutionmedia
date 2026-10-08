-- Administrator-triggered text indexing with durable leases and RLS search.
begin;
alter table public.song_ingestion_jobs
 add column lease_token uuid,
 add column lease_until timestamptz,
 add column indexing_attempts integer not null default 0;

create function public.claim_song_indexing(p_song_id uuid)
returns public.song_ingestion_jobs
language plpgsql security definer set search_path = '' as $$
declare v_job public.song_ingestion_jobs;
begin
 if auth.uid() is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 select * into v_job from public.song_ingestion_jobs
  where song_id=p_song_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Song not found' using errcode='42501'; end if;
 if v_job.status='awaiting_upload' or v_job.status='searchable'
  or (v_job.status='processing' and v_job.lease_until > now()) then
  raise exception 'Song is not available for indexing' using errcode='55000';
 end if;
 update public.song_ingestion_jobs set status='processing', lease_token=gen_random_uuid(),
  lease_until=now()+interval '3 minutes', indexing_attempts=indexing_attempts+1,
  last_error=null, updated_at=now()
 where song_id=p_song_id returning * into v_job;
 return v_job;
end $$;

create function public.finish_song_indexing(p_song_id uuid, p_lease_token uuid, p_embeddings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_job public.song_ingestion_jobs; item jsonb;
begin
 if auth.uid() is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 select * into v_job from public.song_ingestion_jobs
  where song_id=p_song_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Song not found' using errcode='42501'; end if;
 if v_job.status <> 'processing' or v_job.lease_token is distinct from p_lease_token
  or v_job.lease_until <= now() then
  raise exception 'Indexing lease expired or replaced' using errcode='55000';
 end if;
 if jsonb_typeof(p_embeddings) is distinct from 'array' then
  raise exception 'Invalid embeddings' using errcode='22023';
 end if;
 if jsonb_array_length(p_embeddings) not between 1 and 80 then
  raise exception 'Invalid embedding count' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_embeddings) loop
  if coalesce(item->>'modality','') not in ('lyrics','development','description')
   or coalesce(item->>'chunk_index','') !~ '^[0-9]{1,2}$'
   or length(trim(coalesce(item->>'chunk_text',''))) not between 1 and 4000
   or jsonb_typeof(item->'embedding') is distinct from 'array' then
   raise exception 'Invalid embedding record' using errcode='22023';
  end if;
  if jsonb_array_length(item->'embedding') <> 1536
   or exists(select 1 from jsonb_array_elements(item->'embedding') n where jsonb_typeof(n)<>'number') then
   raise exception 'Invalid vector dimensions or values' using errcode='22023';
  end if;
  if extensions.vector_norm((item->>'embedding')::extensions.vector) = 0 then
   raise exception 'Zero vector is not searchable' using errcode='22023';
  end if;
 end loop;
 delete from public.song_embeddings where song_id=p_song_id and model_name='openai/text-embedding-3-small/1536/v1';
 insert into public.song_embeddings(song_id,modality,model_name,chunk_index,chunk_text,embedding)
 select p_song_id, value->>'modality', 'openai/text-embedding-3-small/1536/v1',
  (value->>'chunk_index')::integer, value->>'chunk_text', (value->>'embedding')::extensions.vector
 from jsonb_array_elements(p_embeddings);
 update public.song_ingestion_jobs set status='searchable', last_error=null,
  lease_token=null, lease_until=null, updated_at=now() where song_id=p_song_id;
end $$;

create function public.fail_song_indexing(p_song_id uuid, p_lease_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.is_song_administrator() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 update public.song_ingestion_jobs set status='failed',
  last_error='Text indexing failed. Please retry.', lease_token=null, lease_until=null, updated_at=now()
 where song_id=p_song_id and owner_id=auth.uid() and status='processing' and lease_token=p_lease_token;
end $$;

-- SECURITY INVOKER keeps both songs and embeddings under the caller's RLS.
-- This is catalog discovery, not permission to reuse content for generation.
create function public.search_song_text(p_query extensions.vector(1536), p_limit integer default 10)
returns table(id uuid,title text,description text,visibility text,similarity double precision)
language sql stable security invoker set search_path = '' as $$
 select s.id,s.title,s.description,s.visibility,
  max(1-(e.embedding operator(extensions.<=>) p_query))::double precision as similarity
 from public.songs s join public.song_embeddings e on e.song_id=s.id
 where e.model_name='openai/text-embedding-3-small/1536/v1'
  and extensions.vector_norm(p_query)>0
  and e.modality in ('lyrics','development','description')
 group by s.id,s.title,s.description,s.visibility
 order by similarity desc,s.id
 limit greatest(1,least(coalesce(p_limit,10),20))
$$;
revoke all on function public.claim_song_indexing(uuid) from public,anon;
revoke all on function public.finish_song_indexing(uuid,uuid,jsonb) from public,anon;
revoke all on function public.fail_song_indexing(uuid,uuid) from public,anon;
revoke all on function public.search_song_text(extensions.vector,integer) from public,anon;
grant execute on function public.claim_song_indexing(uuid) to authenticated;
grant execute on function public.finish_song_indexing(uuid,uuid,jsonb) to authenticated;
grant execute on function public.fail_song_indexing(uuid,uuid) to authenticated;
grant execute on function public.search_song_text(extensions.vector,integer) to authenticated;
commit;
