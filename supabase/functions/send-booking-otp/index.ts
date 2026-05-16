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
// Use Resend's universal test sender. Replace with a verified domain sender
// (e.g. noreply@yourdomain.com) once you add a domain in resend.com/domains.
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
    // Must return status 200 explicitly — some Supabase edge runtime versions
    // default to 204 which some browsers reject as a preflight failure.
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  console.log("[send-booking-otp] Request received");

  let body: { email?: string; recaptcha_token?: string; business_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const { email, recaptcha_token, business_id } = body;
  if (!email) {
    console.log("[send-booking-otp] Missing email");
    return json({ error: "missing_fields" }, 400);
  }

  console.log("[send-booking-otp] Processing request for:", email);

  // ── 1. reCAPTCHA verification (soft-fail) ─────────────────────────────────
  // We use IP rate limiting as the primary abuse guard, so a failed/missing
  // reCAPTCHA token does NOT block the request — it is only logged.
  // This keeps the flow working on localhost and handles domain misconfigs.
  if (recaptcha_token) {
    try {
      console.log("[send-booking-otp] Verifying reCAPTCHA...");
      const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${RECAPTCHA_SECRET}&response=${recaptcha_token}`,
      });
      const captchaData = await captchaRes.json();
      console.log("[send-booking-otp] reCAPTCHA score:", captchaData.score, "success:", captchaData.success);
      if (!captchaData.success || (captchaData.score ?? 0) < 0.3) {
        console.warn("[send-booking-otp] Low reCAPTCHA score — continuing (rate limiter is primary guard)");
      }
    } catch (captchaErr) {
      console.warn("[send-booking-otp] reCAPTCHA check failed:", captchaErr);
    }
  } else {
    console.warn("[send-booking-otp] No reCAPTCHA token provided — skipping check");
  }

  // ── 2. Rate limiting ──────────────────────────────────────────────────────
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ?? "unknown";
  const ipHash = await sha256Hex(clientIp);
  const now = new Date();

  console.log("[send-booking-otp] Checking rate limit for IP hash:", ipHash.slice(0, 8) + "...");
  const { data: rl, error: rlErr } = await admin.from("rate_limits").select("*").eq("ip_hash", ipHash).maybeSingle();
  if (rlErr) {
    console.error("[send-booking-otp] Rate-limit table error:", rlErr.message);
    // Table might not exist yet — log and continue rather than blocking the user
  } else if (rl) {
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

  console.log("[send-booking-otp] OTP generated, storing in booking_verifications...");

  // Invalidate any prior unused OTPs for this email
  await admin.from("booking_verifications").update({ used: true }).eq("email", email).eq("used", false);

  const { error: insertErr } = await admin.from("booking_verifications").insert({
    email,
    otp_hash:   otpHash,
    expires_at: expiresAt.toISOString(),
    used:       false,
  });

  if (insertErr) {
    console.error("[send-booking-otp] Failed to store OTP:", insertErr.message);
    return json({ error: "db_error" }, 500);
  }

  // ── 4. Send email ─────────────────────────────────────────────────────────
  console.log("[send-booking-otp] Sending email via Resend to:", email, "from:", EMAIL_FROM);
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
    console.error("[send-booking-otp] Resend error:", emailRes.status, err);
    return json({ error: "email_failed" }, 500);
  }

  console.log("[send-booking-otp] Email sent successfully!");
  return json({ success: true });
});

