import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * verify-booking-otp
 * 1. Finds the most recent valid OTP for the email
 * 2. Verifies HMAC-SHA256 hash with timing-safe compare
 * 3. Marks OTP as used
 * 4. Calls safe_book_appointment to create the booking
 */

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OTP_SECRET       = Deno.env.get("OTP_SECRET")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

  let body: {
    email?: string;
    otp?: string;
    booking_data?: {
      business_id: string;
      customer_id: string | null;
      service_id: string;
      start_time: string;
      end_time: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string | null;
      notes: string | null;
    };
  };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const { email, otp, booking_data } = body;
  if (!email || !otp || !booking_data) return json({ error: "missing_fields" }, 400);

  // ── 1. Find valid OTP record ──────────────────────────────────────────────
  const { data: verification } = await admin
    .from("booking_verifications")
    .select("*")
    .eq("email", email)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verification) return json({ error: "invalid_or_expired" }, 400);

  // ── 2. Verify HMAC ────────────────────────────────────────────────────────
  const expectedHash = await hmacHex(OTP_SECRET, `${otp}:${email}:${verification.expires_at}`);
  if (!timingSafeEqual(expectedHash, verification.otp_hash)) {
    return json({ error: "invalid_code" }, 400);
  }

  // ── 3. Mark as used ───────────────────────────────────────────────────────
  await admin.from("booking_verifications").update({ used: true }).eq("id", verification.id);

  // ── 4. Check max bookings per day (server-side enforcement) ───────────────
  const { data: settings } = await admin
    .from("business_settings")
    .select("max_bookings_per_day")
    .eq("business_id", booking_data.business_id)
    .maybeSingle();

  if (settings?.max_bookings_per_day) {
    const slotDate = new Date(booking_data.start_time);
    const dayStart = new Date(slotDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(slotDate); dayEnd.setHours(23, 59, 59, 999);

    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", booking_data.business_id)
      .neq("status", "cancelled")
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString());

    if ((count ?? 0) >= settings.max_bookings_per_day) {
      return json({ error: "day_fully_booked" }, 409);
    }
  }

  // ── 5. Create the appointment ─────────────────────────────────────────────
  const { data: result, error: rpcErr } = await admin.rpc("safe_book_appointment", {
    p_business_id:    booking_data.business_id,
    p_customer_id:    booking_data.customer_id,
    p_service_id:     booking_data.service_id,
    p_start_time:     booking_data.start_time,
    p_end_time:       booking_data.end_time,
    p_customer_name:  booking_data.customer_name,
    p_customer_email: booking_data.customer_email,
    p_customer_phone: booking_data.customer_phone,
    p_notes:          booking_data.notes,
  });

  if (rpcErr) return json({ error: rpcErr.message }, 500);
  if (!result?.success) return json({ error: "slot_taken" }, 409);

  return json({ success: true, appointment_id: result.appointment_id });
});
