/**
 * deploy-otp-functions.mjs  (v2)
 * Uses the correct Supabase Management API format:
 *   PATCH /v1/projects/{ref}/functions/{name}  with JSON body { verify_jwt, body }
 *
 * Run:  node deploy-otp-functions.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '.env');
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
  }
}

const PROJECT_REF  = env.SUPABASE_PROJECT_REF || 'pvmahztiqdzbsbjwohyv';
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error(`
❌  SUPABASE_ACCESS_TOKEN is not set.

  1. Go to: https://supabase.com/dashboard/account/tokens
  2. Click "Generate new token", give it any name, copy the token.
  3. Add this line to your .env file:
       SUPABASE_ACCESS_TOKEN=your_token_here
  4. Re-run:  node deploy-otp-functions.mjs
`);
  process.exit(1);
}

const BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;
const HEADERS = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

const functions = [
  { name: 'send-booking-otp',   file: 'supabase/functions/send-booking-otp/index.ts' },
  { name: 'verify-booking-otp', file: 'supabase/functions/verify-booking-otp/index.ts' },
];

async function deployFn({ name, file }) {
  console.log(`\n🚀  Deploying ${name}...`);
  const source = readFileSync(resolve(__dirname, file), 'utf8');

  const payload = JSON.stringify({
    name,
    verify_jwt:       false,   // ← THE CRITICAL FIX
    entrypoint_path:  'index.ts',
    body:             source,
  });

  // Try update first (PATCH), then create (POST)
  let res = await fetch(`${BASE}/${name}`, { method: 'PATCH', headers: HEADERS, body: payload });

  if (res.status === 404) {
    console.log(`   Not found — creating new function...`);
    res = await fetch(BASE, { method: 'POST', headers: HEADERS, body: payload });
  }

  const text = await res.text();

  if (!res.ok) {
    console.error(`❌  ${name} failed: ${res.status} ${res.statusText}`);
    console.error(`    ${text}`);
    return false;
  }

  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  console.log(`✅  ${name} deployed! (id: ${data.id ?? 'ok'}, verify_jwt: ${data.verify_jwt})`);
  return true;
}

let allOk = true;
for (const fn of functions) {
  if (!await deployFn(fn)) allOk = false;
}

if (allOk) {
  console.log(`\n🎉  Both OTP functions deployed. The booking flow will now send verification codes.\n`);
} else {
  console.log(`\n⚠️   Some functions failed — check the errors above.\n`);
  process.exit(1);
}
