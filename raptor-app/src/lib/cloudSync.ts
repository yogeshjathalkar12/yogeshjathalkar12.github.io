// Connecting a Google or Microsoft account (server: websites-api raptor/cloud_sync). Closed unless the server is switched on; the screen
// then shows nothing. These are the small decisions the screen makes.
export type CloudProvider = 'google' | 'microsoft';
export interface CloudAccount { provider: CloudProvider; email: string; mail_on: boolean; calendar_on: boolean; last_sync_at: string | null; last_error: string | null }
export interface CloudStatus { open: boolean; providers: CloudProvider[]; accounts: CloudAccount[] }

export const PROVIDER_NAMES: Record<CloudProvider, string> = { google: 'Google', microsoft: 'Microsoft (Outlook)' };

export interface CloudReturn { provider: string; code: string; state: string; failed: boolean }

/** What the provider's visit brought back in the address, or null. */
export function cloudReturn(params: URLSearchParams): CloudReturn | null {
  const provider = params.get('cloud_provider');
  if (!provider) return null;
  const code = params.get('cloud_code') || '';
  const state = params.get('cloud_state') || '';
  return { provider, code, state, failed: params.get('cloud_error') === '1' || !code || !state };
}

export function withoutCloudParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['cloud_provider', 'cloud_code', 'cloud_state', 'cloud_error']) next.delete(key);
  return next;
}

/** Is there anything to show? A closed server with no earlier connection shows nothing at all. */
export const showCloudPanel = (status: CloudStatus | null) => !!status && (status.open || status.accounts.length > 0);

export const calendarChecked = (status: CloudStatus | null) => !!status?.open && status.accounts.some((a) => a.calendar_on && !a.last_error);
