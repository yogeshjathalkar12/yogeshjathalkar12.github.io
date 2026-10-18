// What differs between the web app and the desktop app. The desktop app has its own env.js with the same exports.
import { useOrg } from '../../../hooks/OrgContext';
import { toolApiBase } from '../../../lib/config';
import { supabase } from '../../../lib/supabaseClient';
import { makeApi } from './core';

export const hooksBase = toolApiBase('hooks');
export const api = makeApi({ supabase, base: toolApiBase('connections'), getToken: async () => (await supabase.auth.getSession()).data.session?.access_token });

/** Whether the signed-in person may connect, change and remove connections (the manage-automations permission). */
export function useCanManage(): boolean {
  const { can } = useOrg();
  return can('manage_automations');
}

/** Opens a sign-in page (Google). On the web the same tab goes there; the server brings the person back to this screen. */
export function openUrl(url: string): void {
  window.location.href = url;
}

/** What the server put in the address when it sent the person back from Google: ?connected=… or ?oauth_error=… */
export function readReturn(): { connected?: string; error?: string } {
  const query = (window.location.hash.split('?')[1] || '');
  const params = new URLSearchParams(query);
  return { connected: params.get('connected') || undefined, error: params.get('oauth_error') || undefined };
}
export function clearReturn(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/connections');
}

/** Opens a link in a new tab (a headline, a review on Google). */
export function openLink(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const platform: 'web' | 'desktop' = 'web';
