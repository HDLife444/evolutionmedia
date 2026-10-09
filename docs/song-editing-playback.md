# Song editing and playback

After the text indexing migration, apply
`supabase/migrations/20261008030000_song_editing_playback.sql` once in Supabase
SQL Editor. Do not rerun earlier migrations or upload songs again. Vercel deploys
the accompanying application change from main.

Sign in and choose **Admin** beside Your library. The navigation is visible to
all signed-in users, while the portal and actions require the assigned administrator
role. An account without that role receives an explanation; it cannot edit or upload.

Existing completed uploads have **Edit song** in the ingestion queue. Edit title,
description, lyrics, development goal, emotional progression, tags, origin,
private provenance, visibility, or reuse consent. Saving preserves the audio and
queues indexing again. Select **Index song** to refresh semantic search. Metadata
edits remove stale text embeddings atomically and invalidate expired workers;
active indexing blocks edits. Concurrent editors must reload if a song changed.
Audio replacement is not included in this release.

**Play** and the native audio controls appear in the library, administrator queue,
song editor, and search results. One song plays at a time. Files stay in the private
song-assets bucket. The audio endpoint looks up the asset under RLS and obtains a 60-second signed
URL with the listener’s Supabase client. Owners can listen to private songs;
anonymous and authenticated users can listen to collective songs after applying
the public collective migration. No service key or public bucket is used. Responses are no-store.
Existing signed URLs may work until expiry after visibility changes. Already
received audio cannot be revoked. The Play button refreshes access; if a seek or
native-control request fails after expiry, select Play again. Browser format
support varies; MP3 is the most portable choice.

`npm run test:database` checks owner-only editing, metadata validation, optimistic
concurrency, stale vector removal, active worker protection, preserved recordings,
collective playback visibility, privacy changes, and anonymous private-song denial using a real
local PostgreSQL database with Supabase schema stand-ins. Actual hosted storage
streaming and browser playback require the migration and a signed-in session.
