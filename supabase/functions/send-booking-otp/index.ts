import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * send-booking-otp
 * 1. Verify reCAPTCHA v3 token (score >= 0.5)
 * 2. Rate-limit by hashed IP (10 attempts / hour)
 * 3. Generate 6-digit OTP, HMAC-SHA256 hash it, store in booking_verifications
 * 4. Email the code via Resend
 */

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECAPTCHA_SECRET   = Deno.env.get("RECAPTCHA_SECRET_KEY")!;
const OTP_SECRET         = Deno.env.get("OTP_SECRET")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM         = Deno.env.get("EMAIL_FROM") ?? "BookEase <onboarding@resend.dev>";
const MAX_ATTEMPTS       = 10;
const WINDOW_MS          = 60 * 60 * 1000; // 1 hour
const OTP_TTL_MS         = 10 * 60 * 1000; // 10 minutes

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigit(): string {
  return String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization" },
    });
  }

  let body: { email?: string; recaptcha_token?: string; business_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const { email, recaptcha_token, business_id } = body;
  if (!email || !recaptcha_token) return json({ error: "missing_fields" }, 400);

  // ── 1. reCAPTCHA verification ─────────────────────────────────────────────
  const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${RECAPTCHA_SECRET}&response=${recaptcha_token}`,
  });
  const captchaData = await captchaRes.json();
  if (!captchaData.success || (captchaData.score ?? 0) < 0.5) {
    return json({ error: "captcha_failed" }, 403);
  }

  // ── 2. Rate limiting ──────────────────────────────────────────────────────
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ?? "unknown";
  const ipHash = await sha256Hex(clientIp);
  const now = new Date();

  const { data: rl } = await admin.from("rate_limits").select("*").eq("ip_hash", ipHash).maybeSingle();
  if (rl) {
    const windowAge = now.getTime() - new Date(rl.window_start).getTime();
    if (windowAge < WINDOW_MS) {
      if (rl.attempt_count >= MAX_ATTEMPTS) return json({ error: "rate_limited" }, 429);
      await admin.from("rate_limits").update({ attempt_count: rl.attempt_count + 1 }).eq("ip_hash", ipHash);
    } else {
      await admin.from("rate_limits").update({ window_start: now.toISOString(), attempt_count: 1 }).eq("ip_hash", ipHash);
    }
  } else {
    await admin.from("rate_limits").insert({ ip_hash: ipHash, window_start: now.toISOString(), attempt_count: 1 });
  }

  // ── 3. Generate & store OTP ───────────────────────────────────────────────
  const code      = sixDigit();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const otpHash   = await hmacHex(OTP_SECRET, `${code}:${email}:${expiresAt.toISOString()}`);

  // Invalidate any prior unused OTPs for this email
  await admin.from("booking_verifications").update({ used: true }).eq("email", email).eq("used", false);

  await admin.from("booking_verifications").insert({
    email,
    otp_hash:   otpHash,
    expires_at: expiresAt.toISOString(),
    used:       false,
  });

  // ── 4. Send email ─────────────────────────────────────────────────────────
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    EMAIL_FROM,
      to:      [email],
      subject: `${code} — Your BookEase booking code`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Confirm your booking</h2>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Enter this code in the BookEase booking form to confirm your appointment:</p>
          <div style="background:#f9fafb;border:2px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111827">${code}</span>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:12px">This code expires in <strong>10 minutes</strong>. If you didn't request a booking, you can safely ignore this email.</p>
        </div>`,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    console.error("[send-booking-otp] Resend error:", err);
    return json({ error: "email_failed" }, 500);
  }

  return json({ success: true });
});
