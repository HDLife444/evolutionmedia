# Deploy the sign-in and catalog app

The GitHub repository is `HDLife444/evolutionmedia`. The application lives in
`apps/web`; shared npm workspace dependencies are locked at the repository root.
`apps/web/vercel.json` installs from that root and builds the Next.js app.

## Import in Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Connect GitHub if needed and grant access to `HDLife444/evolutionmedia`.
3. Import that repository, with production branch **main**.
4. Set **Root Directory** to `apps/web` and **Framework Preset** to Next.js.
5. Allow access to files outside the root directory if Vercel displays that
   option. The build needs the repository-root workspace manifest and lockfile.
6. Select **Node.js 24.x** in the project's build settings.
7. Before deploying, add both public environment variables to Production and
   Preview (and Development if using Vercel locally):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gzxsqsbgvgqxblnaiozj.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key supplied for this project |

   Use the existing public key from Supabase's project settings or the ignored
   `apps/web/.env.local`. Do not enter a secret or service-role key in its place.
   `.env.local` is not committed, so GitHub import alone will not supply these
   values. Next.js embeds public settings into the build; changes require a
   fresh deployment.
8. Click **Deploy** and wait for the build to report Ready.

No additional hosted backend or paid resource is required by this initial app.
If Vercel asks for a plan upgrade or charges, review that choice before accepting.

## Validate the deployed application

1. Open the resulting deployment URL and verify the Evolution Media sign-in page.
2. Sign in with the confirmed development user created in Supabase. Enter the
   password only on the app's sign-in form, not in chat.
3. Expect the empty-library message if the user's authorized catalog has no songs.
   A library-unavailable message requires inspection; it is not a passing result.
4. Reload the page to check session persistence, then sign out and verify the
   sign-in form returns.

The app uses password sign-in and server actions, so an OAuth callback URL is not
needed for this flow. Set Supabase's **Authentication → URL Configuration → Site
URL** to the chosen production URL before implementing sign-up emails, password
resets, or other redirect-based authentication. Add explicit redirect URLs for
those future flows when implemented.

The schema's six tables and enabled RLS/read-policy counts were shown in the
user's SQL Editor results. Actual authenticated isolation between users and
Storage access still need their own tests before real song uploads.

## Troubleshooting

- Missing Supabase setting: confirm both variable names, their environment scope,
  and redeploy after saving.
- Missing workspace or lockfile: confirm `apps/web` is the root directory and
  the install command is `cd ../.. && npm ci`.
- Sign-in failure: check that the user belongs to the Evolution Media project,
  is confirmed, and the deployed app uses this project's URL and publishable key.
- Library unavailable: inspect Supabase and server logs for the database error;
  never replace the session-scoped client with a service-role client to bypass RLS.
