# Public collective landing page

Apply `supabase/migrations/20261009000000_public_collective.sql` once after the
song editing/playback migration in Supabase SQL Editor. Refresh the deployed app.
No additional API keys, reuploads, or reindexing are required for public playback.

Signed-out visitors see collective song cards and players before the sign-in
form. Collective designation publishes song metadata (including lyrics and
musical context) and audio to anyone. Upload and edit forms explain this meaning.
Private songs remain owner-only. Ingestion evidence/provenance, embeddings,
lineage, jobs, feedback, administrator actions and paid search stay protected.

Anonymous access uses SELECT-only RLS policies for collective songs, their audio
asset rows, and matching Storage objects. The bucket stays private. The player
uses the same no-store endpoint and 60-second signed URLs. There is no service
key or browser-exposed private key. Changing a song to private revokes new public
lookups/URL creation; existing URLs may work until expiry, and audio already
received cannot be revoked.

Database checks cover anonymous collective catalog and storage access, private
isolation, public upload/edit denial, evidence isolation, and revocation after a
visibility change. The hosted migration must be applied to activate public access.
