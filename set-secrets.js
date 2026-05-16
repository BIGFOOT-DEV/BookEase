/**
 * set-secrets.js  (updated)
 * Pushes ALL required edge function secrets to Supabase via Management API.
 * Reads SUPABASE_ACCESS_TOKEN from .env if not passed as CLI arg.
 *
 * Run with:  node set-secrets.js
 *   or:      node set-secrets.js YOUR_ACCESS_TOKEN
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env ────────────────────────────────────────────────────────────────
const envFile = resolve(__dirname, '.env')
const env = {}
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')
  }
}

const accessToken = process.argv[2] || env.SUPABASE_ACCESS_TOKEN
if (!accessToken) {
  console.error('❌  No access token found. Add SUPABASE_ACCESS_TOKEN to .env or pass it as an argument.')
  process.exit(1)
}

const PROJECT_REF = 'pvmahztiqdzbsbjwohyv'

const secrets = [
  // ── Email ──────────────────────────────────────────────────────
  { name: 'RESEND_API_KEY',        value: env.RESEND_API_KEY        || 're_rSaMopJV_D4WiwvBGwa6H2r3RXWJJq3fq' },
  { name: 'EMAIL_FROM',            value: env.EMAIL_FROM            || 'BookEase <onboarding@resend.dev>' },
  // ── Push notifications ─────────────────────────────────────────
  { name: 'APP_URL',               value: 'https://bookease.vercel.app' },
  { name: 'VAPID_PUBLIC_KEY',      value: env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY  || 'BK6EcS2qgaSPT6jVUI22YYZVxwUVsXKIMnlthL8rAhtxZoqFo6Gh5XHFZDTg6Jt2lp3lRl9xt-nQQX_3i-uKQjA' },
  { name: 'VAPID_PRIVATE_KEY',     value: env.VAPID_PRIVATE_KEY     || 'MTtHitPbw-SwCm9xW48__3Sjd8Xf5hFRzu9UylQv6PY' },
  // ── Field-level encryption ─────────────────────────────────────
  { name: 'ENCRYPTION_SECRET',     value: env.ENCRYPTION_SECRET     || 'aacb191ecae580e40c7d7f25a27df32790d4165fda065bcf25636b292f58a380' },
  // ── Abuse prevention / OTP ─────────────────────────────────────
  { name: 'RECAPTCHA_SECRET_KEY',  value: env.RECAPTCHA_SECRET_KEY  || '6LdS7-gsAAAAABRkJF_n6kvohj5RmdUVTee6MhKr' },
  { name: 'OTP_SECRET',            value: env.OTP_SECRET            || '280ab05e8b725d03f3c1eb59aef4c147dfd6d37b1a434bb69b1a4a5b0a6c8dd9' },
]

console.log(`\n🔐  Pushing ${secrets.length} secrets to project ${PROJECT_REF}...\n`)

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  },
  body: JSON.stringify(secrets),
})

const text = await res.text()
if (res.ok) {
  console.log('✅  All secrets pushed successfully!\n')
  secrets.forEach(s => console.log(`   • ${s.name}`))
  console.log('\n🎉  Your edge functions can now read these values at runtime.\n')
} else {
  console.error(`❌  Failed: ${res.status} ${res.statusText}`)
  console.error(`    ${text}`)
  process.exit(1)
}
