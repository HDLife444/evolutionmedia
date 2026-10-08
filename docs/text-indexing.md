# Activate text indexing and semantic search

The uploaded audio and metadata already exist. Do not upload the song again or
rerun earlier migrations. This release adds administrator-triggered indexing,
durable three-minute leases/retries, and RLS-aware text similarity search.

## One-time activation

1. In Evolution Media's Supabase SQL Editor, run the new migration
   `supabase/migrations/20261008020000_text_indexing.sql` once. It is transactional.
2. In Vercel → evolutionmedia → Settings → Environment Variables, add:

   - Name: `SOUND_VECTOR_EMBEDDING_API_KEY`
   - Value: an OpenAI API key from the OpenAI API platform
   - Type: **Secret**
   - Environments: **Production and Preview**

   This variable is server-only and must not have a `NEXT_PUBLIC_` prefix.
   Do not put its value in chat or GitHub. An OpenAI API account with billing is
   required; a ChatGPT subscription does not supply API usage. Indexing and each
   search incur the provider's embedding API charges. Only trusted administrators
   can trigger these paid API calls in this release.
3. Redeploy after setting the key and wait for Ready.
4. Sign in, open `/admin`, and click **Index song** for the existing queued song.
5. Expect **Searchable** after embedding persistence succeeds. Try **Search by
   meaning** using a development goal reflected in the song.

The cloud configuration may also declare this credential for development. That
does not populate Vercel's production settings; they are separate environments.

## Scope and model

The initial model is OpenAI `text-embedding-3-small`, explicitly using 1536
dimensions. Stored space identifier: `openai/text-embedding-3-small/1536/v1`.
Lyrics, development goal/emotional progression, and title/description are indexed
as separate text chunks. Indexing preserves all supplied text; each chunk is
bounded to 1000 Unicode code points. Private provenance and uploaded audio are
not sent to the text embedding provider.

This provides text-semantic retrieval, not audio similarity, model training, or
new-song generation. Search respects the caller's songs/embedding RLS; private
songs are excluded from other users' results. Catalog discovery does not grant
permission to reuse lyrics/audio for generation. Future composition retrieval
must separately honor rights, reuse consent, and training permissions.

## Durability

Before the provider call, an administrator-owned job is claimed with a fresh
lease token. An active lease prevents duplicate concurrent processing. If a
Vercel action is interrupted, **Retry indexing** can reclaim it after three
minutes. A stale action cannot commit or overwrite a newer attempt.

Vector writes and the transition to Searchable commit together. Failed provider
or validation calls mark the attempt failed when possible. Retrying may incur
another API charge if a response was lost; external calls cannot be rolled back
with the database transaction. No automatic paid retry loop is installed.

Indexing is started by the administrator, not a scheduled background daemon.
Background automation can later use the durable job model with appropriate
worker authentication and operational limits.

## Validation

`npm run test:ingestion` checks Unicode chunking, provenance exclusion, vector
ordering/model/dimensions, malformed responses, and mocked provider failures.
`npm run test:database` checks leases, stale workers, atomic persistence, and
private/anonymous retrieval isolation in real PostgreSQL/pgvector.

Test vectors and mocked API responses are synthetic. These checks do not verify
a real hosted OpenAI embedding call. Live indexing/search needs the new database
migration and server credential and is verified by indexing the uploaded song.
