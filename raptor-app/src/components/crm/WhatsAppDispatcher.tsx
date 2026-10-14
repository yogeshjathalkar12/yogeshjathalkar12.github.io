import { useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { dispatchCrmWhatsApp } from '../../lib/whatsappDispatch';

// Headless, mounted once in the dashboard layout. While Raptor is open it sends the CRM pipeline's queued WhatsApp
// messages: right away when a fresh one appears (a card's WhatsApp button, or a new deal in automatic mode), and by checking
// every 45 seconds for ones that had to wait (business hours, daily limit, a temporary error).
// It does nothing at all while WhatsApp automation is Off.

const POLL_MS = 45 * 1000;
const IDLE_MS = 5 * 60 * 1000;      // automation is Off: just notice if it is switched on
const BACKOFF_MS = 10 * 60 * 1000;  // the database part is not installed yet

export function WhatsAppDispatcher() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let wait = IDLE_MS;
      try {
        const settings = await supabase.from('crm_whatsapp_settings').select('mode').maybeSingle();
        if (settings.error) {
          wait = BACKOFF_MS;
        } else if (settings.data && settings.data.mode !== 'off') {
          wait = POLL_MS;
          const waiting = await supabase.from('deal_whatsapp').select('deal_id', { count: 'exact', head: true }).eq('status', 'pending');
          if (!waiting.error && (waiting.count || 0) > 0) await dispatchCrmWhatsApp();
        }
      } catch {
        wait = POLL_MS;
      } finally {
        if (!stopped) timer = setTimeout(tick, wait);
      }
    };
    timer = setTimeout(tick, 3000);

    // A message that was just queued: send it now instead of waiting for the next check. Rows that carry a note
    // ("waiting for business hours...") are our own updates coming back, so they are left to the 45 second check.
    const channel = supabase
      .channel('crm-whatsapp-dispatch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_whatsapp' }, (payload: any) => {
        const row = payload.new;
        if (row && row.status === 'pending' && !row.error) dispatchCrmWhatsApp();
      })
      .subscribe();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
