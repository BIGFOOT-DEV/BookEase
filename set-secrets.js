// Sets Supabase Edge Function secrets via Management API
// Run with: node set-secrets.js YOUR_SUPABASE_ACCESS_TOKEN
// Get token at: https://supabase.com/dashboard/account/tokens

const accessToken = process.argv[2]
if (!accessToken) {
  console.error('Usage: node set-secrets.js <your-supabase-access-token>')
  console.error('Get your token at: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const PROJECT_REF = 'pvmahztiqdzbsbjwohyv'

const secrets = [
  { name: 'RESEND_API_KEY',       value: 're_rSaMopJV_D4WiwvBGwa6H2r3RXWJJq3fq' },
  { name: 'EMAIL_FROM',           value: 'BookEase <onboarding@resend.dev>' },
  { name: 'APP_URL',              value: 'https://bookease.vercel.app' },
  { name: 'VAPID_PUBLIC_KEY',     value: 'BK6EcS2qgaSPT6jVUI22YYZVxwUVsXKIMnlthL8rAhtxZoqFo6Gh5XHFZDTg6Jt2lp3lRl9xt-nQQX_3i-uKQjA' },
  { name: 'VAPID_PRIVATE_KEY',    value: 'MTtHitPbw-SwCm9xW48__3Sjd8Xf5hFRzu9UylQv6PY' },
  { name: 'ENCRYPTION_SECRET',    value: 'aacb191ecae580e40c7d7f25a27df32790d4165fda065bcf25636b292f58a380' },
  // Abuse prevention
  { name: 'RECAPTCHA_SECRET_KEY', value: '6LdS7-gsAAAAABRkJF_n6kvohj5RmdUVTee6MhKr' },
  { name: 'OTP_SECRET',           value: '280ab05e8b725d03f3c1eb59aef4c147dfd6d37b1a434bb69b1a4a5b0a6c8dd9' },
]

async function setSecrets() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(secrets),
  })

  const text = await res.text()
  if (res.ok) {
    console.log('✅ All secrets set successfully!')
    secrets.forEach(s => console.log(`   • ${s.name}`))
  } else {
    console.error('❌ Failed to set secrets:', res.status, text)
  }
}

setSecrets().catch(console.error)
