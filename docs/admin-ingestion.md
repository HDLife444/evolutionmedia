# Administrator song ingestion

This first ingestion release provides an administrator-only `/admin` upload page,
private audio storage, rights/sharing confirmation, durable upload reservations,
and a durable indexing queue. A successful upload is **Awaiting indexing**, not
**Searchable**. [Text indexing activation](text-indexing.md) adds the administrator
Index song action and semantic search once its migration and credential are set.

## Activate in the Evolution Media database

The six original tables already exist. Do not rerun the initial creation script.

1. Open Evolution Media (`gzxsqsbgvgqxblnaiozj`) → SQL Editor → New query.
2. Copy and run `supabase/migrations/20261008010000_admin_ingestion.sql` once.
   It creates administrator permissions, ingestion jobs, two authorized RPCs,
   Storage policies, and a private `song-assets` bucket. If the transaction fails,
   share the error; its changes roll back together. It deliberately rejects an
   existing public bucket with the same name rather than changing its exposure.
3. In a separate query run `supabase/admin/assign-initial-administrator.sql`.
   It assigns the user UUID supplied by the project owner:
   `851d2e86-8cc5-4a68-847a-5cd93070ac77`. The assignment can safely be rerun.
   That user must exist in this project's Authentication users list.
4. Wait for Vercel's deployment of the new GitHub commit to become Ready.
5. Sign in with that user and open `/admin`, or choose **Admin** in the
   library. No additional app environment variables or service-role key are
   needed for uploading.

Administrator roles are database records managed through administrative SQL.
User-editable account metadata and knowledge of a UUID cannot grant the role.
The initial user remains a normal authenticated user until the assignment runs.

## Upload one seed song

Choose an MP3, WAV, or FLAC up to 50 MiB. Supply its title, lyrics when available,
development goal, emotional progression, genres/moods, source provider, and
provenance/rights evidence. Provenance stays in the owner-only ingestion record.

Collective visibility requires explicit consent to publish audio, lyrics,
descriptions, goals, and musical metadata for everyone, including visitors
without an account. Apply the public collective migration to activate this access. Remove personal information
before sharing. Private uploads remain private. Permission to use the content
for future composition context is a separate checkbox. Training remains false;
Industry Integration is not enabled by uploading.

The file is sent directly to Supabase Storage instead of passing large audio
through a Vercel Server Action. Metadata uses authorized Server Actions/RPCs.
The database rechecks the administrator role, validates the manifest and consent,
and restricts uploads to the reserved owner/song path. Incomplete songs are
private, regardless of the intended final visibility.

After Storage confirms the file, the completion transaction verifies object
size/MIME metadata, creates one asset record, applies the selected visibility,
and queues indexing. Rights clearance represents the administrator's attestation,
not an automated legal determination.

The SHA-256 manifest is computed in the browser and checked when selecting a
resume file. Storage object size/MIME are checked by the database. Server-side
verification of the complete audio digest and actual audio decoding/analysis
are not implemented in this release.

## Resume an interruption

The upload reservation and intended metadata survive in the database. Choose
**Resume this upload** in the ingestion queue and select the same audio file.
The browser checks its SHA-256/size/type. If an upload succeeded but its response
was lost, an existing immutable object can be finalized after manifest checks.
Completion retries do not create duplicate asset records.

Only an upload UUID is remembered in browser session storage, not song lyrics or
provenance. The database queue can still be used if browser storage is disabled.
Starting another song leaves the old reservation pending; deletion/cleanup of
abandoned drafts is a future administration feature.

## Next: indexing

See [text indexing](text-indexing.md). The administrator-triggered processor uses
1536-dimensional text vectors, leases, retries, and atomic status updates. It
requires a server credential and incurs API usage only when indexing/search is
requested. Do not mix models or audio vectors in that embedding space.

## Verification

- `npm run test:database`: real PostgreSQL/pgvector, simulated Storage tables;
  checks administrator permissions, private visibility, upload paths, manifests,
  missing-file rejection, owner-only evidence, and idempotent completion.
- `npm run test:ingestion`: consent, input limits, and audio signature checks.
- `npm run test:auth`: real SSR SDK with a local Auth stand-in.
- `npm run typecheck` and `npm run build`: Next.js route/type/build checks.

These local tests do not exercise the hosted Storage upload service. After
activation, test a real upload and confirm its record/asset and queued status
in the dashboard. Verify another user cannot access `/admin` or its objects.
