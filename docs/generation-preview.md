> Historical temporary connection. For new generation, use [Permanent private music server](persistent-music-server.md). New requests are fixed at four minutes; the old duration choices and browser connection form below are retired.

# Private site generation preview

The web interface is `/generate`, linked from the landing page and Admin. It
requires validated Supabase sign-in and `is_song_administrator()` on the page
and every job, audio, and connection endpoint. No new SQL migration or OpenAI
API billing is required for this generator preview.

The user enters a moment/desired state (500 code points), chooses one of twelve
genres, selects vocals/instrumental/soundscape, and requests 30/60/90/120 seconds.
A UUID represents the request. Repeating the same ID/payload returns the same
worker job; changing its payload conflicts. The UI polls existing jobs rather
than silently requesting more GPU work after a lost reply. It shows queue,
progress, completion, failure, recent tracks, inline playback, download, and
owner-confirmed deletion. Completed tracks can be added to private playlists.
The worker must advertise `capabilities.delete_jobs` before deletion is enabled;
an existing Lambda worker needs the update in its setup documentation.

## Lambda connection

The private repository `HDLife444/evolutionmedia-generator` contains the worker
and `docs/lambda-setup.md`. Its launcher uses the already installed, pinned
ACE-Step environment in `~/ACE-Step-1.5`. One GPU job executes at a time. The
worker uses local ACE-Step planning for vocal lyrics; no OpenAI request is made.

The launcher binds the API to loopback and creates a temporary Cloudflare HTTPS
tunnel. A random server key is required on every versioned endpoint. The launch
command prints `{ "url": "https://…trycloudflare.com", "key": "…" }`. Paste this
block directly into `/generate/connect`; do not put it in chat or GitHub.

The connection endpoint validates administrator access and same-origin requests,
limits input size, restricts hosts to generated trycloudflare.com HTTPS origins,
rejects paths/credentials/query fragments, checks the worker key, then stores it
in a Secure/HttpOnly/SameSite=Strict cookie scoped to the signed-in account.
The server key is not returned by JSON responses or included in browser bundles.
The administrator supplies it once through the setup form; cleartext keys are
not written to the application repository/database or local browser storage.

The connection lasts twelve hours in that browser. Signing out or disconnecting
clears it. Restarting the tunnel changes its URL; rerun the launcher and reconnect.
Use a stable domain and server-managed secret storage for a long-lived deployment.

Site APIs forward only fixed worker paths and the verified account ID; they do
not accept browser-supplied owners or arbitrary filesystem download paths. They
refuse redirects, use bounded timeouts, return private/no-store responses, and
sanitize errors. MP3 outputs at 128kbps keep the maximum two-minute response below
Vercel's response limit; WAV originals can exceed it. Playback supports byte ranges.

## Durability and current scope

Job status and private generated MP3 files live on the Lambda instance's local
disk. A worker restart preserves completed jobs, fails interrupted running jobs
without regenerating them, and resumes previously queued jobs. Terminating the
Lambda instance deletes local files; download test tracks before termination.
This preview does not yet copy new audio into the Supabase library, publish
collective songs, or create persistent Sound Vector embeddings. Playlists store
owner-private track references after the separate playlist migration; they do
not make a permanent copy of generated audio. See [playlist activation](private-playlists.md).

Disconnecting the site or stopping the worker does not stop Lambda compute
billing. Manage the instance itself in Lambda. Existing RunPod storage and any
running/auto-deploy resources are independent of this connection.

## Validation

`npm run test:generation` checks supported/bounded inputs, SSRF protection,
connection host validation, same-origin requests, sanitized presentation, and
JSON body limits. The private worker has independent tests of authorization,
owner isolation, durable idempotency/queues/restarts, audio path constraints,
and mocked model integration. Site build/typecheck and anonymous HTTP checks
must pass before deployment. The owner has generated and played tracks through
the website. Synthetic worker tests do not establish real generation quality;
deletion still needs the current worker installed and a live owner test.
