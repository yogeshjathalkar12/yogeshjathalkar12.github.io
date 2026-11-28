// A team's Slack or Teams channel (db/migrations/2026-12-01_a_chat_alerts.sql; the server posts the messages). The channel address is
// saved once and never read back: only whether one is set, and which service.
import { supabase } from './supabaseClient';
import { isNotInstalled } from './dbMissing';

const API_BASE = import.meta.env.VITE_RAPTOR_API_URL || 'https://websites-api-5wmu.onrender.com';
export const CHAT_SQL = '2026-12-01_a_chat_alerts.sql';

export interface ChatHook { kind: 'slack' | 'teams'; send_updates: boolean; last_sent_at: string | null }
export const SERVICE_NAMES: Record<ChatHook['kind'], string> = { slack: 'Slack', teams: 'Microsoft Teams' };

export async function chatStatus(): Promise<{ installed: boolean; hook: ChatHook | null }> {
  const { data, error } = await supabase.rpc('chat_hook_status');
  if (error) {
    if (isNotInstalled(error)) return { installed: false, hook: null };
    throw error;
  }
  return { installed: true, hook: (data as ChatHook[] | null)?.[0] || null };
}

/** url: a new address, '' to remove it, null to keep it and change only whether updates are sent. */
export async function saveChat(url: string | null, sendUpdates: boolean | null): Promise<void> {
  const { error } = await supabase.rpc('chat_hook_save', { p_url: url, p_send_updates: sendUpdates });
  if (error) throw new Error(error.message);
}

async function post(path: string, body: unknown): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to do this.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/raptor/chat${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. It may be starting up: try again in a minute.');
  }
  const answer = await response.json().catch(() => ({}));
  if (response.status === 404 && !answer.detail?.includes?.('competitor')) throw new Error('The server does not have this feature yet.');
  if (!response.ok) throw new Error(typeof answer.detail === 'string' ? answer.detail : 'The message could not be sent.');
  return SERVICE_NAMES[answer.to as ChatHook['kind']] || 'the channel';
}

export const sendChatTest = () => post('/test', {});
export const sendCompetitorCard = (competitorId: string) => post('/competitor-card', { competitor_id: competitorId });
