const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function readEnv() {
  const values = { ...process.env };
  const filename = path.join(__dirname, '..', '.env');
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

async function main() {
  const env = readEnv();
  const databaseUrl = env.SUPABASE_DATABASE_URL || env.SUPABASE_DB_URL || env['SUPABASE DATABASE CONNECTION STRING'] || env['SUPABASE DATABASE URL'];
  const databasePassword = env.SUPABASE_DATABASE_PASSWORD || env.SUPABASE_DB_PASSWORD || env['SUPABASE DATABASE PASSWORD'];
  const databaseCert = env.SUPABASE_DATABASE_SSL_CERT || env.SUPABASE_DB_SSL_CERT || env['SUPABASE DATABASE SSL CERTIFICATE'];
  if (!databaseUrl) throw new Error('Missing Supabase connection string in .env.');

  const connection = new URL(databaseUrl);
  if (databasePassword) connection.password = databasePassword;
  const certificateFromUrl = connection.searchParams.get('sslrootcert');
  const certificatePath = databaseCert || certificateFromUrl;
  let ssl = { rejectUnauthorized: true };
  if (certificatePath) {
    const fullPath = path.isAbsolute(certificatePath) ? certificatePath : path.resolve(__dirname, '..', certificatePath);
    ssl = { ca: fs.readFileSync(fullPath, 'utf8'), rejectUnauthorized: true };
  }
  for (const option of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) connection.searchParams.delete(option);

  const pool = new Pool({
    connectionString: connection.toString(),
    ssl,
    max: 1,
    connectionTimeoutMillis: 10000
  });

  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS table_exists,
        ARRAY(
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = ANY(ARRAY['id', 'google_sub', 'email', 'full_name', 'avatar_url'])
          ORDER BY column_name
        ) AS available_columns
    `);
    const { table_exists: tableExists, available_columns: columns } = result.rows[0];
    const required = ['google_sub', 'email', 'full_name', 'avatar_url'];
    const missing = required.filter(column => !columns.includes(column));
    console.log('Supabase connection: OK');
    console.log(`public.users table: ${tableExists ? 'found' : 'missing'}`);
    console.log(`Google profile columns: ${missing.length ? `missing ${missing.join(', ')}` : 'ready'}`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    console.error('Supabase TLS certificate is not trusted. Download the project root certificate and set SUPABASE_DATABASE_SSL_CERT in .env.');
    process.exitCode = 1;
    return;
  }
  const reason = [error.name, error.code, error.syscall, error.message].filter(Boolean).join(' ');
  console.error(`Supabase check failed: ${reason || 'Unknown database connection error.'}`);
  process.exitCode = 1;
});
