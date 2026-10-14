import { supabase } from './supabaseClient';
import { toolApiBase } from './config';

// Asks the backend to send the WhatsApp messages the CRM pipeline has queued (the WhatsApp button, or automatic mode).
// Only the backend can send them: it holds your WhatsApp access token. Safe to call as often as you like: it sends a
// few at a time, checks business hours and the daily limit itself, and never sends the same message twice.
// See raptor/whatsapp/router.py (/crm/dispatch) and db/migrations/2026-10-14_crm_whatsapp.sql.

const WHATSAPP_API = toolApiBase('whatsapp');

export interface DispatchResult {
  sent: number;
  failed: number;
  waiting: number;
  skipped: number;
  pending_left: number;
}

let inFlight: Promise<DispatchResult | null> | null = null;

export function dispatchCrmWhatsApp(): Promise<DispatchResult | null> {
  if (inFlight) return inFlight; // one call at a time per tab
  inFlight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const resp = await fetch(`${WHATSAPP_API}/crm/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) return null;
      return (await resp.json()) as DispatchResult;
    } catch {
      return null; // offline or the server is waking up: the next poll tries again
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
