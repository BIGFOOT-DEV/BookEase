/**
 * Stub for jsr:@supabase/functions-js/edge-runtime.d.ts
 *
 * This file is imported as a side-effect in some Edge Functions to augment
 * global types. The Deno runtime resolves the real package from JSR; this stub
 * prevents the VS Code TypeScript language server from erroring on the import
 * when the Deno extension is not installed.
 */

// The real package extends the global Request/Response types for the edge
// runtime — no re-exports needed, this is intentionally empty.
export {};
