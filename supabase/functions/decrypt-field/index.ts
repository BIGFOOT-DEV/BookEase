import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * BookEase — decrypt-field Edge Function
 *
 * Server-side AES-256-GCM decryption for internal use only (e.g., notification
 * dispatch needs to read the customer's phone number).
 *
 * SECURITY: This function requires the SERVICE_ROLE JWT — it must never be
 * called from the browser client.  The verify_jwt flag is set to true (enforced
 * at deploy time), and we additionally check that the caller's role is
 * 'service_role'.
 *
 * Request body: { "value": "<iv_b64>:<ciphertext_b64>" }
 * Response:     { "plaintext": "<decrypted string>" }
 */

const ALGO             = "AES-GCM";
const PBKDF2_HASH      = "SHA-256";
const PBKDF2_ITER      = 100_000;
const KEY_BITS         = 256;
const SALT             = new TextEncoder().encode("bookease-field-encryption-v1");

let cachedKey: CryptoKey | null = null;

async function getDerivedKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const secret = Deno.env.get("ENCRYPTION_SECRET");
  if (!secret) throw new Error("ENCRYPTION_SECRET env var not set");

  const rawKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  cachedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: PBKDF2_ITER, hash: PBKDF2_HASH },
    rawKey,
    { name: ALGO, length: KEY_BITS },
    false,
    ["decrypt"],
  );

  return cachedKey;
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  // ── Auth check: only service_role callers allowed ─────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  // The verify_jwt Supabase flag validates the JWT signature; here we also
  // enforce that the decoded role claim is service_role.
  // (Supabase injects the decoded JWT payload as a header when verify_jwt=true)
  const jwtPayloadHeader = req.headers.get("x-supabase-auth") ?? "{}";
  let jwtPayload: { role?: string } = {};
  try { jwtPayload = JSON.parse(jwtPayloadHeader); } catch { /* ignore */ }

  if (jwtPayload.role !== "service_role") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { value?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { value } = body;

  if (!value) {
    return new Response(JSON.stringify({ plaintext: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Legacy plain-text (not encrypted) — pass through
  if (!value.includes(":")) {
    return new Response(JSON.stringify({ plaintext: value }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────
  try {
    const [ivB64, ctB64] = value.split(":");
    const key            = await getDerivedKey();
    const iv             = fromBase64(ivB64).slice();  // Uint8Array<ArrayBuffer> ✓
    const ciphertext     = fromBase64(ctB64).slice();  // Uint8Array<ArrayBuffer> ✓

    const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
    const plaintext = new TextDecoder().decode(plainBuf);

    return new Response(JSON.stringify({ plaintext }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Decryption failed: " + (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
