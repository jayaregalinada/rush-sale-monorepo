/**
 * Base URL of the Rush Sale API. Defaults to the same-origin `/api` prefix, which the
 * web server (nginx in prod, the Vite dev server locally) proxies to the API service.
 * Keeping it same-origin sidesteps CORS and host/IP quirks, so it works on any OS.
 * Override with VITE_API_URL only when pointing the bundle at a different host.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
