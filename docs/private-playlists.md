# Private playlists and track deletion

Signed-in listeners have three choices on the home page: find existing songs,
create a custom song, and build a playlist. Custom generation remains restricted
to the administrator during testing. Ordinary signed-in listeners can create
and manage playlists of songs they can access.

## Activate playlist storage once

The existing catalog and generation configuration are preserved. In the
Evolution Media Supabase project's SQL Editor, run only
`supabase/migrations/20261021000000_private_playlists.sql` once. Do not rerun
the earlier creation migrations. This migration adds the two owner-private
playlist tables, indexes, ownership policies, and capacity/identity triggers.
It does not delete songs or change their visibility.

- SQL Editor: https://supabase.com/dashboard/project/gzxsqsbgvgqxblnaiozj/sql/new
- Migration: https://github.com/HDLife444/evolutionmedia/blob/main/supabase/migrations/20261021000000_private_playlists.sql
- Playlist page: https://evolutionmedia.vercel.app/playlists

Until the migration is applied, the signed-in page reports that playlist setup
is not finished. No service-role key or new Vercel variable is needed.

## Use playlists

Create a named playlist on `/playlists`. Choose **Add to playlist** on a found
catalog song or a completed custom track. The same track is saved only once in
each playlist. The playlist player has Play/Pause, Previous/Next, and advances
to the next track when playback ends. Entries play in the order they were added.

Removing an entry or deleting a playlist removes only those references. It does
not delete recordings. Playlists persist with the account in Supabase and remain
private to their owner across browsers. Each account can have 50 playlists,
with up to 200 tracks in each; database triggers enforce these limits for REST
writes as well as website requests.

Catalog audio access is checked again at playback. If a catalog owner makes a
song private, saved metadata is hidden from listeners who lost access. Saving
a song in a playlist does not change visibility or grant reuse rights.

## Delete unwanted generated tracks

The private generator repository contains the corresponding worker update:
https://github.com/HDLife444/evolutionmedia-generator/blob/main/docs/lambda-setup.md#update-an-existing-worker-for-track-deletion

After that update and reconnection, completed and failed tracks have a **Delete
track** control. A confirmation is required; queued/running tracks cannot be
deleted. The authenticated server supplies the verified owner ID. The worker
removes the original prompt, generated lyrics, job record, and its own confined
output directory. Same-owner retries are safe. Minimal deletion receipts
preserve rate limits and stop old requests from regenerating.

After confirmed worker deletion, the website removes references from that
owner's playlists. If the playlist database cannot be reached, the track still
stays deleted and the page asks the owner to remove any remaining playlist entry.

Generated audio still lives on the connected music server. Adding it to a
playlist does not upload a separate permanent copy. Download recordings to keep
before terminating the Lambda instance. The playlist names and references
remain in Supabase, but a deleted/terminated server cannot play those recordings.

## Find existing songs

**By moment** uses the existing semantic matcher. It retains its provider quota
and availability requirements. **By title or words** searches literal words in
catalog titles, lyrics, descriptions, genre/mood, and development metadata; it
requires no external model call. Both return only collective songs that have
audio assets, and neither saves or logs the listener's query. No full catalog
is displayed automatically. Literal search is capped at a 100-song catalog and
ten results while this collection is small; a growing catalog needs DB search.

## Validation

`npm run test:database` applies all migrations in an isolated disposable
PostgreSQL database. Playlist checks cover two owners, anonymous denial,
identity and catalog privacy protections, duplicate prevention, deletion
cascades, preserving original songs, and both capacity limits.

`npm run test:playlists`, `npm run test:catalog`, `npm run test:generation`,
`npm run test:auth`, typecheck, and production build cover the web changes.
The private worker has separate authorization, deletion, rate-limit, upgrade,
and filesystem confinement tests. Hosted playlist storage and GPU deletion
require the one-time migration and worker update above.
