// Centralised config. Previously every one of the 10 HTML files hardcoded
// these three values independently (with localStorage overrides via the
// Settings panel in dashboard.html). Now there's exactly one place to
// change them. Vite env vars (VITE_*) let you set real values per-
// environment without touching source; the literals here are your current
// production values, kept as fallbacks so a fresh checkout behaves
// identically to the old static site with zero setup.

export const RAPTOR_API_URL: string =
  import.meta.env.VITE_RAPTOR_API_URL || 'https://websites-api-5wmu.onrender.com';

// The LOCAL desktop app's backend (raptor/api/server.py), not the hosted
// one above. Only reachable when the desktop app is actually running on
// this machine — that's a hard requirement for calls, since mic capture
// only exists there. Requires https://shoonyaorigins.com to be added to
// that server's RAPTOR_ALLOWED_ORIGINS (CORS) for this to work from a
// plain browser tab rather than an Electron shell.
export const RAPTOR_LOCAL_API_URL: string =
  import.meta.env.VITE_RAPTOR_LOCAL_API_URL || 'http://localhost:8765';

// Matches raptor-ui's App.js convention exactly (CLIENT_ID = localStorage
// 'raptor_client_id' || 'default') — the desktop backend's multi-tenant
// "client_id" concept is separate from Supabase auth (contacts/deals use
// owner_id = auth.uid()), so for a single-account setup this just needs
// to match whatever the desktop app is already using.
export const RAPTOR_CLIENT_ID: string =
  (typeof window !== 'undefined' && window.localStorage.getItem('raptor_client_id')) || 'default';

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://pcdbtcpctlnvdtbrrqoo.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjZGJ0Y3BjdGxudmR0YnJycW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MjIxMjQsImV4cCI6MjA5ODE5ODEyNH0._y59k8mmSqvkCL9gPBWp5hfp2LwpP_IBvr5h7y3nP7Q';

// Base path for each tool's backend routes, e.g. `${RAPTOR_API_URL}/api/raptor/chronos`
export function toolApiBase(toolSlug: string): string {
  return `${RAPTOR_API_URL}/api/raptor/${toolSlug}`;
}