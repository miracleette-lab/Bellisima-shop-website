const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = __dirname;

function loadEnv() {
  const filename = path.join(ROOT, '.env');
  const values = { ...process.env };
  if (!fs.existsSync(filename)) return values;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    if (!/^[A-Za-z_][A-Za-z0-9_ ]*$/.test(key) || Object.hasOwn(values, key)) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const ENV = loadEnv();

const CLIENT_ID = ENV.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = ENV.GOOGLE_CLIENT_SECRET;
const PORT = Number(ENV.PORT || 3000);
const BASE_URL = (ENV.BASE_URL || ENV['BASE URL'] || `http://localhost:${PORT}`).replace(/\/$/, '');
const BASE_ORIGIN = new URL(BASE_URL).origin;
const COOKIE_SECURE = new URL(BASE_URL).protocol === 'https:';
const OAUTH_CALLBACK = `${BASE_URL}/auth/google/callback`;
const DATABASE_PASSWORD = ENV.SUPABASE_DATABASE_PASSWORD || ENV.SUPABASE_DB_PASSWORD || ENV['SUPABASE DATABASE PASSWORD'];
const DATABASE_URL = ENV.SUPABASE_DATABASE_URL || ENV.SUPABASE_DB_URL || ENV['SUPABASE DATABASE CONNECTION STRING'] || ENV['SUPABASE DATABASE URL'];
const DATABASE_CERT_PATH = ENV.SUPABASE_DATABASE_SSL_CERT || ENV.SUPABASE_DB_SSL_CERT || ENV['SUPABASE DATABASE SSL CERTIFICATE'];
const SESSION_COOKIE = 'bellisima_session';
const STATE_COOKIE = 'bellisima_oauth_state';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const sessions = new Map();

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Set both in .env before starting the server.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Missing Supabase database connection string. Set SUPABASE_DATABASE_URL or SUPABASE DATABASE CONNECTION STRING in .env.');
  process.exit(1);
}

const { Pool } = require('pg');
const databaseConnection = new URL(DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(databaseConnection.protocol)) {
  console.error('The Supabase database connection string must start with postgres:// or postgresql://.');
  process.exit(1);
}
if (DATABASE_PASSWORD) databaseConnection.password = DATABASE_PASSWORD;
if (databaseConnection.password.includes('[YOUR-PASSWORD]')) {
  console.error('Replace [YOUR-PASSWORD] in the Supabase connection string, or set SUPABASE DATABASE PASSWORD in .env.');
  process.exit(1);
}
// Use verified TLS and avoid a connection-string sslmode overriding this setting.
const certificateFromUrl = databaseConnection.searchParams.get('sslrootcert');
const certificatePath = DATABASE_CERT_PATH || certificateFromUrl;
let databaseSsl = { rejectUnauthorized: true };
if (certificatePath) {
  const fullCertificatePath = path.isAbsolute(certificatePath) ? certificatePath : path.resolve(ROOT, certificatePath);
  try {
    databaseSsl = { ca: fs.readFileSync(fullCertificatePath, 'utf8'), rejectUnauthorized: true };
  } catch {
    console.error('Could not read the Supabase root certificate. Check SUPABASE_DATABASE_SSL_CERT in .env.');
    process.exit(1);
  }
}
for (const option of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) databaseConnection.searchParams.delete(option);
const database = new Pool({
  connectionString: databaseConnection.toString(),
  ssl: databaseSsl,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookie(name, value, maxAge, httpOnly = true) {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${httpOnly ? '; HttpOnly' : ''}${COOKIE_SECURE ? '; Secure' : ''}`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  });
  res.end(body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function exchangeCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: OAUTH_CALLBACK,
      grant_type: 'authorization_code'
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(`Google token exchange failed: ${details.error || response.status}${details.error_description ? ` (${details.error_description})` : ''}`);
    error.stage = 'exchange';
    throw error;
  }
  return response.json();
}

async function getGoogleProfile(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const error = new Error(`Google profile request failed (${response.status}).`);
    error.stage = 'profile';
    throw error;
  }
  const profile = await response.json();
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    const error = new Error('Google did not return a verified email address.');
    error.stage = 'profile';
    throw error;
  }
  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name || profile.email,
    picture: profile.picture || ''
  };
}

async function saveGoogleUser(profile) {
  try {
    const result = await database.query(
      `INSERT INTO public.users (google_sub, email, full_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_sub) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()
       RETURNING id, email, full_name, avatar_url`,
      [profile.sub, profile.email, profile.name, profile.picture]
    );
    const row = result.rows[0];
    return { id: row.id, email: row.email, name: row.full_name, picture: row.avatar_url || '' };
  } catch (cause) {
    const detail = cause.code === 'SELF_SIGNED_CERT_IN_CHAIN'
      ? 'Supabase TLS certificate is not trusted. Download the project root certificate and set SUPABASE_DATABASE_SSL_CERT in .env.'
      : cause.message;
    const error = new Error(`Supabase user save failed: ${detail}`);
    error.stage = cause.code === 'SELF_SIGNED_CERT_IN_CHAIN' ? 'database_tls' : 'database';
    throw error;
  }
}

function serveStatic(req, res, pathname) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/auth.js': ['auth.js', 'text/javascript; charset=utf-8']
  };
  const entry = files[pathname];
  if (!entry || req.method !== 'GET') return false;
  fs.readFile(path.join(ROOT, entry[0]), (error, data) => {
    if (error) return send(res, 500, 'Unable to load the site.');
    send(res, 200, data, entry[1], { 'Cache-Control': 'no-cache' });
  });
  return true;
}

async function handle(req, res) {
  const url = new URL(req.url, BASE_URL);
  const cookies = parseCookies(req.headers.cookie);

  if (req.method === 'GET' && url.pathname === '/auth/google') {
    const state = randomToken();
    const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizeUrl.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: OAUTH_CALLBACK,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      include_granted_scopes: 'true',
      prompt: 'select_account'
    });
    return redirect(res, authorizeUrl.toString(), {
      'Set-Cookie': cookie(STATE_COOKIE, state, 600),
      'Cache-Control': 'no-store'
    });
  }

  if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
    const clearState = cookie(STATE_COOKIE, '', 0);
    if (url.searchParams.get('error') === 'access_denied') return redirect(res, '/?auth=cancelled', { 'Set-Cookie': clearState });
    if (url.searchParams.has('error')) return redirect(res, '/?auth=failed&reason=google', { 'Set-Cookie': clearState });
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!safeEqual(state, cookies[STATE_COOKIE]) || !code) {
      return redirect(res, '/?auth=failed&reason=state', { 'Set-Cookie': clearState });
    }
    try {
      const tokens = await exchangeCode(code);
      if (!tokens.access_token) throw new Error('Google did not return an access token.');
      const googleProfile = await getGoogleProfile(tokens.access_token);
      const user = await saveGoogleUser(googleProfile);
      const sessionId = randomToken();
      sessions.set(sessionId, { user, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 });
      return redirect(res, '/', {
        'Set-Cookie': [clearState, cookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE)],
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      console.error('Google sign-in failed:', error.message);
      return redirect(res, `/?auth=failed&reason=${error.stage || 'server'}`, { 'Set-Cookie': clearState });
    }
  }

  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const session = sessions.get(cookies[SESSION_COOKIE]);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) sessions.delete(cookies[SESSION_COOKIE]);
      return send(res, 200, JSON.stringify({ user: null }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
    return send(res, 200, JSON.stringify({ user: session.user }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  }

  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    if (req.headers.origin !== BASE_ORIGIN) return send(res, 403, 'Invalid request origin.');
    if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8', {
      'Set-Cookie': cookie(SESSION_COOKIE, '', 0),
      'Cache-Control': 'no-store'
    });
  }

  if (serveStatic(req, res, url.pathname)) return;
  send(res, 404, 'Not found.');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    console.error('Request failed:', error.message);
    if (!res.headersSent) send(res, 500, 'Something went wrong. Please try again.');
    else res.end();
  });
});

server.listen(PORT, () => console.log(`Bellisima is running at ${BASE_URL}`));
