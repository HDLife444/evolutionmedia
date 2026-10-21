# Evolution Media — Sound Vector

Initial schema for The Collective Music Intelligence Architecture.

## Phase 1
1. Create an independent Evolution Media Supabase organization/project.
2. Use `HDLife444/evolutionmedia` on GitHub (public by the owner's choice).
3. Commit this migration; deploy to a development database.
4. Create a private `song-assets` Storage bucket.
5. Choose separate embedding models/dimensions for audio and text before ingestion.
6. Ingest 12 rights-cleared seed songs with provenance and metadata.
7. Build a server-side authorized similarity-search endpoint and ingestion worker.
8. Build a Vercel dashboard showing catalog, song detail, retrieval tests, and lineage.

## Security
RLS is enabled on every table. Catalog writes use authorized backend functions.
Private playlist writes are restricted to their owner by RLS and database triggers.
Private songs remain indexed but excluded from collective retrieval.
Never expose a Supabase service key in a Vercel client.
The collective-access default must be disclosed and agreed to before upload.

## Repository foundation

The supplied migration is retained unchanged. The repository includes an
architecture record, a schema review, local database tests, and a Next.js web
app with Supabase authentication, an authorized song catalog, and an administrator
upload portal with a durable ingestion queue. The upload portal requires its
follow-up migration and administrator assignment. Administrator text indexing
and semantic search are implemented and require their own migration and a secure
server-side embedding-provider key. Audio-similarity indexing is future work.

The Evolution Media Supabase project is `gzxsqsbgvgqxblnaiozj`. Its Auth endpoint
and `songs` endpoint have been verified with the supplied publishable key. The
earlier live connection check passed before public collective access was introduced.
The public collective migration now permits anonymous discovery and audio access
for collective songs only.
The user's SQL Editor results show all six expected tables. Exact remote schema,
RLS policies, authenticated visibility, and Storage access still need validation;
do not rerun the creation migration against the existing tables.

- [Architecture and product decisions](docs/architecture.md)
- [Schema review and required follow-up work](docs/schema-review.md)
- [Next implementation steps](docs/next-steps.md)
- [Web app setup and Supabase connection](docs/web-setup.md)
- [Vercel deployment and sign-in verification](docs/vercel-deployment.md)
- [Activate the administrator upload portal](docs/admin-ingestion.md)
- [Activate text indexing and semantic search](docs/text-indexing.md)
- [Activate the public collective landing page](docs/public-collective.md)
- [Listener moment search and relevance checks](docs/listener-moments.md)
- [Permanent private music server](docs/persistent-music-server.md)
- [Earlier music generation preview](docs/generation-preview.md)
- [Private playlists, title search, and track deletion](docs/private-playlists.md)

## Run the web app

Use Node.js 24 (see `.node-version`) and npm from the repository root:

```sh
npm ci --cache /workspace/.npm-cache
cp apps/web/.env.example apps/web/.env.local
# Set the project's public publishable key in apps/web/.env.local.
npm run dev
```

Preserve an existing `.env.local`; copy the template only for a fresh checkout.
The configured cloud instance already has the supplied values in this ignored
file. In the Codex cloud environment, prefix server and connection-check commands
with `NODE_USE_ENV_PROXY=1` so Node uses the platform's HTTPS proxy.

```sh
npm run typecheck
npm run test:auth
npm run test:ingestion
npm run build
NODE_USE_ENV_PROXY=1 npm run check:connection
```

The app uses `proxy.ts` (the Next.js 16 convention) to validate and refresh
sessions, propagating cookie updates to both server renders and the browser.
The catalog queries `songs` with the visitor’s anonymous or signed-in identity and respects
database RLS. It does not use the unrelated `todos` quickstart example or any
service-role credential.

## Validate the initial schema locally

Requires Bash and a running Docker daemon:

```sh
cd /workspace/evolutionmedia
bash tests/database/run.sh
```

The runner uses a digest-pinned PostgreSQL 17 image with pgvector, creates an
isolated disposable database without published ports, applies the migration,
and checks permissions for two authenticated users and an anonymous role.
It removes its own container and volume on exit. Synthetic test vectors verify
storage and access; they are not real musical or semantic embeddings.

Supabase authentication is simulated for these tests. Hosted authentication,
Storage, and application behavior must be tested when those components exist.

Song editing and authenticated audio playback: see [activation instructions](docs/song-editing-playback.md).
