# Permanent private music server

The Lambda worker connects **outbound** to the existing Vercel website. No
Cloudflare account, tunnel, public GPU port, new domain, GoDaddy change, or
browser connection key is needed. Generation remains administrator-only.

New vocal songs, instrumentals, and soundscapes request **240 seconds**. There
is no length selector. The worker measures the MP3 with ffprobe and rejects
results of three minutes or less; it never loops or pads a short result.
Full-length sound and vocal quality must still be checked on the live GPU.

## 1. Apply the database migration once

In this project's Supabase SQL Editor, run the **entire** contents of:

[supabase/migrations/20261022000000_persistent_music_server.sql](../supabase/migrations/20261022000000_persistent_music_server.sql)

Existing migrations, including the working playlists tables, must already be
applied. Do not rerun the older migrations. The new migration adds its own
queue, worker enrollment, recordings, owner policies, and a private
`generated-music` bucket. It does not replace existing songs or playlists.

## 2. Add one private Vercel setting

In Supabase **Project Settings → API Keys**, find the server-only key
(`service_role` under legacy keys, or a server secret key). Copy it directly
into the Evolution Media Vercel project's **Settings → Environment Variables**:

- Name: `SUPABASE_SERVICE_ROLE_KEY`
- Value: the private Supabase server key
- Environment: Production

Keep the existing public Supabase URL and publishable-key variables. Do not
prefix the new name with `NEXT_PUBLIC_`, put it in GitHub, or send it in chat.
Redeploy Production after saving the variable. This key stays on Vercel; it is
never sent to the browser or Lambda. The GPU receives a separate revocable,
owner-bound worker credential instead.

`EVOLUTION_SITE_URL` defaults to `https://evolutionmedia.vercel.app`. Only set it
if the canonical production website address changes later.

## 3. Enroll and install the worker

Sign in as the administrator and open:
https://evolutionmedia.vercel.app/generate/connect

Choose **Download server configuration**. Keep `evolutionmedia-worker.json`
private. It is a file to upload, not a terminal command or text to paste into a
website box. Download the current private worker repository ZIP from
HDLife444/evolutionmedia-generator (**Code → Download ZIP**).

In Lambda JupyterLab, open the existing `ACE-Step-1.5` folder in the left file
panel. Use the upward-arrow upload button to upload **both** files:

- `evolutionmedia-worker.json`
- `evolutionmedia-generator-main.zip`

If the browser renamed a download with `(1)`, rename it to the exact filename
above. Wait for any existing track to finish. Open a Jupyter Terminal and run:

```bash
(
set -e
python3 -m zipfile -e "$HOME/ACE-Step-1.5/evolutionmedia-generator-main.zip" "$HOME"
sudo python3 "$HOME/evolutionmedia-generator-main/tools/install_cloud_worker.py"
)
```

The installer verifies enrollment, GPU access, models, and audio tools before
stopping the old Evolution Media worker and its temporary tunnel. It leaves
Lambda's Jupyter service, models, and existing recordings in place. It installs
an ordinary-user systemd service, enables startup after reboot, and restarts
it after failures. The downloaded configuration and installed copy are private
files with mode 0600.

Completed old MP3 test tracks are copied into account storage with their
original identifiers, length, and playlist references. They are not generated
again. Old local copies remain until you explicitly delete those tracks.
Unreadable old files are skipped without deleting them. The first status check
can take longer while recordings are copied.

Return to the website and choose **Check server status**. Once ready, create a
vocal song, an instrumental, and a soundscape. Listen for meaning, clear vocals,
phrasing, emotional development, and the ending. A longer request does not by
itself guarantee intelligible or thematically accurate singing.

## Operation and durability

- Sign-outs, browser changes, and tunnel rotation no longer disconnect enrollment.
- The GPU must remain running for new generation. A reboot starts the service;
  terminating/replacing the instance still requires reinstalling its engine and
  worker. Billing continues while Lambda bills the instance. Stopping this
  service alone does not stop instance billing.
- Completed recordings and playlists remain available from private Supabase
  storage while the GPU is offline. This uses Supabase storage and bandwidth.
- The database queue survives web requests. One GPU task runs at a time. Lost
  completion replies are retried idempotently. An interrupted GPU attempt is
  marked failed after its lease expires, rather than silently generated twice.
- Delete track removes cloud audio, private recording content, and playlist
  references. The online worker also removes any old local copy or failed
  upload recovery copy on its next idle cleanup pass. If it is offline, that
  local cleanup waits until it reconnects. Downloaded copies on other devices
  are not controlled by the service. Minimal identifiers/timestamps remain for
  safe retries and spending limits. Already issued playback URLs expire within
  ten minutes.
- New audio is MP3 at 192 kbps, under an 8 MiB delivery cap. Audio uploads go
  directly to private Storage with scoped signed URLs, and playback uses signed
  URLs with range support. Four-minute audio never goes through a Vercel
  function response body.

Inspect service health without exposing its private configuration:

```bash
systemctl status evolutionmedia-generator --no-pager
journalctl -u evolutionmedia-generator -n 30 --no-pager
```

For code updates, upload the new ZIP, wait for active work to finish, and rerun
the installation block. Keep the current configuration file; a new enrollment
is unnecessary for normal code updates. A **replacement configuration** revokes
the previous credential and must be installed on the worker. Wait for active
work before replacing it. Never share the downloaded JSON or its token.

## Verified here versus live

Automated checks cover queue permissions, owner isolation, spending limits,
leases, retry behavior, private storage paths, importer behavior, deletion,
full-length input validation, duration rejection, and service configuration.
The models are mocked in local tests. The owner previously generated short
tracks through the old connection; live four-minute GPU generation and sound
quality are pending activation and listening tests.
