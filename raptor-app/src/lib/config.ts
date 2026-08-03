// Centralised config. Previously every one of the 10 HTML files hardcoded
// these three values independently (with localStorage overrides via the
// Settings panel in dashboard.html). Now there's exactly one place to
// change them. Vite env vars (VITE_*) let you set real values per-
// environment without touching source; the literals here are your current
// production values, kept as fallbacks so a fresh checkout behaves
// identically to the old static site with zero setup.

export const RAPTOR_API_URL: string =
  import.meta.env.VITE_RAPTOR_API_URL || 'https://websites-api-5wmu.onrender.com';

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://pcdbtcpctlnvdtbrrqoo.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjZGJ0Y3BjdGxudmR0YnJycW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MjIxMjQsImV4cCI6MjA5ODE5ODEyNH0._y59k8mmSqvkCL9gPBWp5hfp2LwpP_IBvr5h7y3nP7Q';

// Base path for each tool's backend routes, e.g. `${RAPTOR_API_URL}/api/raptor/chronos`
export function toolApiBase(toolSlug: string): string {
  return `${RAPTOR_API_URL}/api/raptor/${toolSlug}`;
}
