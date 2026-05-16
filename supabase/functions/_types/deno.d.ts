/**
 * Minimal Deno global type declarations for Supabase Edge Functions.
 *
 * These allow the standard VS Code TypeScript language server to recognise
 * Deno.env.get(), Deno.serve(), etc. without requiring the Deno VS Code
 * extension.  They cover every Deno API used across this project's functions.
 *
 * These declarations are intentionally minimal — they only expose the surface
 * actually used in this codebase, not the entire Deno API.
 */

declare namespace Deno {
  // ── Environment variables ────────────────────────────────────────────────
  interface Env {
    /** Returns the value of the environment variable, or `undefined`. */
    get(key: string): string | undefined;
    /** Sets the value of the environment variable. */
    set(key: string, value: string): void;
    /** Removes the environment variable. */
    delete(key: string): void;
    /** Returns a snapshot of all environment variables. */
    toObject(): Record<string, string>;
    /** Returns whether the environment variable exists. */
    has(key: string): boolean;
  }

  /** Read/write access to environment variables. */
  const env: Env;

  // ── HTTP server ──────────────────────────────────────────────────────────
  interface ServeOptions {
    /** The port to listen on. Defaults to 8000. */
    port?: number;
    /** The hostname to listen on. Defaults to "0.0.0.0". */
    hostname?: string;
    /** An abort signal to stop the server. */
    signal?: AbortSignal;
    /** Whether to reuse the port. */
    reusePort?: boolean;
    /** Called on uncaught errors. */
    onError?: (error: unknown) => Response | Promise<Response>;
    /** Called when the server starts listening. */
    onListen?: (params: { hostname: string; port: number }) => void;
  }

  type ServeHandler = (request: Request) => Response | Promise<Response>;

  /**
   * Starts an HTTP server that calls the given handler for every request.
   * This is the primary entry-point for Supabase Edge Functions.
   */
  function serve(handler: ServeHandler, options?: ServeOptions): void;
}
