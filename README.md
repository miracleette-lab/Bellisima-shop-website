# Bellisima

## Run locally

Install Node.js 18 or newer, copy `.env.example` to `.env`, and set the Google OAuth client ID and client secret in `.env`. Then run:

```sh
npm start
```

Open <http://localhost:3000>.

In Google Cloud Console, configure the OAuth consent screen and add these values to the **Web application** OAuth client:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/auth/google/callback`

The redirect URI must match exactly. For deployment, set `BASE_URL` to the public HTTPS origin and add `${BASE_URL}/auth/google/callback` as an authorized redirect URI. Keep `.env` private; the client secret is read only by the server and is never sent to the browser.

## Deploy on Render

Create a **Web Service** connected to this repository. Render's build command can be left blank (or set to `npm install`), and the start command is `npm start`. In the service's **Environment** settings, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SUPABASE_DATABASE_URL` with the values from Google Cloud and Supabase. Optionally add `SUPABASE_DATABASE_PASSWORD` if the password is not already part of the connection URL. Set `BASE_URL` to the Render service's public `https://...onrender.com` URL, then add `https://...onrender.com/auth/google/callback` to the Google OAuth client's authorized redirect URIs. Render does not read your computer's local `.env` file automatically; environment values must be added to the service settings.

The storefront can start if `SUPABASE_DATABASE_URL` is missing, but Google sign-in cannot save or sign in users until that variable is set. The `/healthz` endpoint reports whether the database connection is configured.

## Save Google users in Supabase

The server uses the PostgreSQL connection string and database password from `.env`. It accepts `SUPABASE_DATABASE_URL` and `SUPABASE_DATABASE_PASSWORD`, or the existing keys named `SUPABASE DATABASE CONNECTION STRING` and `SUPABASE DATABASE PASSWORD`.

1. In the Supabase Dashboard, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql) once to create `public.users`.
2. In **Connect**, copy the database connection string. Use the direct connection for a persistent server, or the Session pooler if your network needs IPv4. Put it in `.env`; the separate password setting replaces the password portion in the URL.
3. Restart with `npm start` and sign in with Google. The callback inserts the Google account, or updates its name, email, and avatar when that same Google account signs in again.

If Node reports `SELF_SIGNED_CERT_IN_CHAIN`, download the project's root certificate from **Database → Settings → SSL Configuration**, save it as `supabase/prod-supabase.cer.crt`, set `SUPABASE_DATABASE_SSL_CERT=./supabase/prod-supabase.cer.crt` in `.env`, and restart. This keeps TLS certificate verification enabled.

The database connection is used only by the Node server. The browser never receives the database password or connection string.

Google sign-in uses the OpenID Connect `openid email profile` scopes. The server exchanges the authorization code with Google, fetches the verified profile, saves it to Supabase, and sets an HTTP-only session cookie. Sessions currently live in server memory for seven days, so a server restart signs users out and a multi-instance deployment needs shared session storage.
