import type { SmsApi } from './smsApi';

// Headless: while Raptor is open it sends the CRM pipeline's queued first texts and the follow-up texts that have come due. Only the
// server can send (it holds the Twilio key), and it checks sending hours, the daily limit, opt-outs and double sends itself, so asking
// often is safe. There is no scheduler anywhere in Raptor, so nothing is sent while no Raptor window is open.
//   * right away when a fresh text is queued (a card's SMS button, or a new deal in automatic mode)
//   * every 60 seconds for what had to wait (sending hours, the daily limit, a temporary error) and for follow-ups that are due
//   * nothing at all while the tables are missing or nothing is waiting
// Shared by the web app (components/crm/SmsDispatcher.tsx) and the desktop app (generated with the rest of the hub).

const POLL_MS = 60 * 1000;
const BACKOFF_MS = 10 * 60 * 1000;   // the database part is not installed yet

export interface DispatchDeps { supabase: any; api: Pick<SmsApi, 'dispatch'>; poll?: number }

/** Starts the loop. Returns a function that stops it. */
export function startSmsDispatcher({ supabase, api, poll = POLL_MS }: DispatchDeps, first = 3000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const dispatch = async () => {
    if (busy) return;
    busy = true;
    try { await api.dispatch(); } finally { busy = false; }
  };

  const tick = async () => {
    let wait = poll;
    try {
      const queued = await supabase.from('deal_sms').select('deal_id', { count: 'exact', head: true }).eq('status', 'pending');
      if (queued.error) {
        wait = BACKOFF_MS;
      } else {
        const due = await supabase.from('sms_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('next_at', new Date().toISOString());
        if ((queued.count || 0) > 0 || (!due.error && (due.count || 0) > 0)) await dispatch();
      }
    } catch {
      wait = poll;
    } finally {
      if (!stopped) timer = setTimeout(tick, wait);
    }
  };
  timer = setTimeout(tick, first);

  // A text that was just queued: send it now. Rows that carry a note ("waiting for sending hours...") are our own updates coming back,
  // so they are left to the next check.
  let channel: any = null;
  try {
    channel = supabase.channel('crm-sms-dispatch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_sms' }, (payload: any) => {
        const row = payload && payload.new;
        if (row && row.status === 'pending' && !row.error) dispatch();
      })
      .subscribe();
  } catch { /* no realtime: the 60 second check still runs */ }

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { if (channel) supabase.removeChannel(channel); } catch { /* already gone */ }
  };
}
