# Evolution Media

Evolution Media is the product ecosystem. The Collective Music Intelligence
Architecture is its underlying technology. Sound Vector owns the asset catalog,
embeddings, permission-aware retrieval, provenance, lineage, and feedback.

The supplied conversation is design background. Statements in it about external
accounts, provider capabilities, pricing, licenses, and market outcomes have not
been independently verified in this development session.

## Product decisions carried forward

- Begin with 12 foundational personal development songs.
- Register and index every generated song, including private songs.
- Collective retrieval is the default after informed upload consent.
- Premium privacy excludes the audio, lyrics, embeddings, and personal metadata
  of private songs from other users' retrieval and generation context.
- Industry Integration is independent of retrieval visibility. Public commercial
  distribution does not automatically permit reference reuse or model training.
- Keep generation providers replaceable. Suno is an initial candidate; ACE-Step
  and other providers can follow. Provider access and terms require verification.
- Ask Life is a future knowledge source, accessed only with authorization.
- Octave informs progression. Its stage definition still needs confirmation;
  the starter's 1–12 constraint is provisional, not an established product rule.

## First functional milestone

Upload one rights-cleared seed song → retain its audio and provenance → create
text/development embeddings → retrieve it by personal development meaning →
display the authorized result. Repeat with all 12 songs after this cycle passes.
Audio embeddings and generation-engine integration follow separately; text
search must not be presented as audio similarity.

Supabase supplies PostgreSQL, pgvector, authentication, and a private song-assets
bucket. A trusted ingestion worker validates ownership, consent, entitlements,
and rights, stores assets, and records indexing status. Requests use the caller's
identity for permission checks. Service credentials remain on the server.

Retrieval must isolate embedding model, modality, dimension, and model version.
Shared songs are candidates only under the chosen rights and consent policy;
private songs are candidates only for authorized owners. Access to song metadata
is not a grant to reuse audio or train a model.

Personal Ask Life conversations and user profiles remain private inputs. Do not
place raw conversations, account details, or other users' personal context in
collective metadata or embeddings. The precise treatment of personalized lyrics
needs a consent and redaction design before public uploads.

## Repository layout

Implemented in this first step:

```text
supabase/migrations/  Initial six-table database schema
tests/database/      Local PostgreSQL + pgvector permission checks
docs/                Architecture, schema review, and next implementation steps
apps/web/            Next.js sign-in and authorized song catalog
scripts/             Live Supabase connection check
```

Add these components when their milestone is implemented, rather than creating
empty applications now:

```text
apps/web/                    Extend the catalog with upload and semantic search
packages/sound-vector/       Embedding and retrieval contracts
packages/music-intelligence/ Composition context and evaluation
packages/ask-life-client/    Authorized knowledge retrieval
packages/generation-router/ Provider adapters
services/ingestion-worker/   Asset analysis and indexing
```

Music generation GPU workloads belong in a separate service, not the Vercel web
request lifecycle. Retrieval improves composition context; it does not retrain
the generator by itself.
