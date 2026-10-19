# Find music for this moment

The landing page offers a description field and four example moments. Signed-out
visitors and signed-in listeners receive up to three playable collective songs.
Private songs are excluded even for their owner in this public discovery flow.
Results display each song's actual development goal; no generated explanation,
confidence percentage, or fabricated match is shown. Unrelated requests can
return no close matches. Matching uses text meaning, not audio similarity.

## Current implementation

POST `/api/moments` accepts a JSON `{ "query": "..." }` body, with at most 500
Unicode code points and a 4096-byte body. The caller's Supabase client and RLS
fetch only collective songs with audio assets. Lyrics, description, development
goal, emotional progression, genres, and moods are embedded using the existing
OpenAI `text-embedding-3-small` model at 1536 dimensions. Arbitrary metadata,
provenance, accounts, private songs, and raw audio are excluded.

For this small foundational collection, the server builds an in-memory public
index. It reuses the same text chunking/model as administrator indexing, but does
not need a new database function, migration, or manual reindexing to expose
public search. Existing persisted administrator embeddings remain separate.
This avoids granting visitors direct access to the embeddings table. Every
request refetches the public catalog; a content or visibility change invalidates
the public cache. Only public vectors/text are cached for up to an hour per
server instance. Concurrent cold requests share index construction.

Each request embeds the listener's description, computes cosine similarity,
and takes the best chunk match for each modality per song. Development context
has weight .55, description .30, lyrics .15, normalized over present modalities.
The initial minimum combined similarity is .28. This is a retrieval cutoff, not
a calibrated probability. Matches are limited to three distinct song IDs.

Public search uses `SOUND_VECTOR_EMBEDDING_API_KEY` in Vercel's server environment,
which is already used for administrator indexing. Requests and public corpus
refreshes incur embedding API usage. No key is sent to the browser. A missing
connection or provider failure displays a retry/browse message; keyword matching
or unrelated songs are not silently substituted.

Listener text is sent to the embedding provider to fulfill the search, and is
not stored in the database, shared corpus, application logs, cache, or URL.
The provider's own retention policies still apply. Responses are private/no-store.
No user profile, health inference, or recommendation history is created.

## Bounds and next scale step

The preview supports up to 100 audio-bearing collective songs and 256 chunks;
it reports unavailability rather than silently dropping a larger corpus. Two
provider calls at most (cold corpus, query) use 20-second timeouts. The route
allows up to three concurrent requests, six requests per visitor per minute,
and thirty requests per minute per server instance. Visitor addresses are
hashed with an ephemeral HMAC key; counts clear every minute. These limits
are local to each Vercel instance and are not a global spend cap. As public
traffic grows, use shared rate limits/edge controls and a public-only database
retrieval function over persisted vectors instead of the small in-memory index.

## Verification

- `npm run test:moments`: input validation, public-only documents/provenance
  exclusion, ranking, unrelated results, cache invalidation, provider failure
  recovery, concurrency, and rate-limit reset using synthetic embeddings.
- `npm run test:ingestion`: existing real SDK contract mocks, chunking, model,
  vector validation, and provider failure checks.
- `NODE_USE_ENV_PROXY=1 node scripts/evaluate-moments.mjs`: six real public search
  requests against production. Optional first argument selects another base URL.
  This invokes the configured embedding provider and may incur API usage. Expect
  the intended song among the top three, and no result for the unrelated query.
  The fixtures were selected from the actual song descriptions and goals before
  evaluating. They are an initial developer relevance check, not listener-rated
  proof of quality; expand them with the owner's judgments.

Playback reuses the existing signed-URL player. The library remains browsable
when matching is unavailable. No Supabase migration is required for this release.

## Deployment validation status

The public UI and endpoint are deployed. Type checking, the production build,
seven moment-search unit tests, seven ingestion/provider-contract tests, and
local HTTP checks passed. The production library is reachable, but live matching
returns HTTP 503 with `matching_quota`; OpenAI returns 429 with exhausted account
quota. The six relevance cases are therefore blocked, not passed or evidence of
poor ranking. No listener-quality claim has been made from synthetic vectors.

Activate API billing/available credits for the OpenAI project whose key is saved
as `SOUND_VECTOR_EMBEDDING_API_KEY` in Vercel. A ChatGPT subscription is separate.
If the same key remains valid, no app deployment, database migration, or manual
song reindexing is needed after quota becomes available. Rerun the evaluation
script and check the example results and playback before marking live relevance
verified. The script stops on a service failure instead of issuing more requests.
