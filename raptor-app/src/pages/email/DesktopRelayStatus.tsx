import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// What the web app shows for the "send through my desktop app" mode: is the desktop app online, what is waiting
// for it, and what happened to recent mail. Everything is read straight from Supabase (row-level security
// already limits it to the signed-in user), and cancelling goes through the relay_cancel function.
// The rows are written by the server and by the desktop app; see db/migrations/2026-10-10_email_relay.sql.

interface Heartbeat {
  last_seen_at: string;
  mailbox_connected: boolean;
  paused_reason: string | null;
  pending_count: number;
}

interface RelayRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  send_after: string;
  expires_at: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

const POLL_MS = 15000;
const ONLINE_WITHIN_MS = 90 * 1000; // the desktop app reports in about every 30 seconds
const WAITING = ['queued', 'claimed', 'accepted'];

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  queued: { text: 'Waiting for desktop', color: 'var(--dim)' },
  claimed: { text: 'Desktop picked it up', color: 'var(--purple)' },
  accepted: { text: 'In desktop queue', color: 'var(--purple)' },
  sent: { text: 'Sent', color: 'var(--green, #22c55e)' },
  replied: { text: 'Replied', color: 'var(--green, #22c55e)' },
  bounced: { text: 'Bounced', color: 'var(--red)' },
  failed: { text: 'Failed', color: 'var(--red)' },
  cancelled: { text: 'Cancelled', color: 'var(--dim)' },
  expired: { text: 'Expired (not sent)', color: 'var(--red)' },
};

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

function until(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'now';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

export default function DesktopRelayStatus() {
  const [beat, setBeat] = useState<Heartbeat | null>(null);
  const [rows, setRows] = useState<RelayRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [b, q] = await Promise.all([
        supabase.from('desktop_heartbeats').select('last_seen_at, mailbox_connected, paused_reason, pending_count').maybeSingle(),
        supabase
          .from('email_relay_queue')
          .select('id, to_email, subject, status, send_after, expires_at, sent_at, error, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (b.error || q.error) throw b.error || q.error;
      setBeat((b.data as Heartbeat) || null);
      setRows((q.data as RelayRow[]) || []);
      setFailed(false);
    } catch {
      setFailed(true); // e.g. the relay SQL has not been run yet; the rest of the page still works
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setTick((n) => n + 1), 30000); // keeps "2 min ago" honest between polls
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  async function cancel(id: string) {
    await supabase.rpc('relay_cancel', { p_id: id });
    load();
  }

  if (!loaded) return null;
  if (failed) {
    return (
      <div style={{ fontSize: '0.62rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        Desktop sending status isn't available yet. The database part of this feature still has to be installed.
      </div>
    );
  }

  const online = !!beat && Date.now() - new Date(beat.last_seen_at).getTime() < ONLINE_WITHIN_MS;
  const waiting = rows.filter((r) => WAITING.includes(r.status));
  const oldestExpiry = waiting.length ? waiting.map((r) => r.expires_at).sort()[0] : null;

  let headline: string;
  let color: string;
  let detail: string;
  if (!beat) {
    headline = 'Your desktop app has not connected yet';
    color = 'var(--red)';
    detail = 'Open the Raptor desktop app and sign in with this account. It reports here every 30 seconds.';
  } else if (!online) {
    headline = 'Desktop app is offline';
    color = 'var(--red)';
    detail = `Last seen ${ago(beat.last_seen_at)}. Open the Raptor desktop app to send the waiting mail.`;
  } else if (!beat.mailbox_connected) {
    headline = 'Desktop app is online, but no mailbox is connected';
    color = '#eab308';
    detail = 'In the desktop app go to Email > Mailbox and connect the mailbox mail should be sent from.';
  } else if (beat.paused_reason) {
    headline = 'Desktop app is online, but sending is paused';
    color = '#eab308';
    detail = `Reason: ${beat.paused_reason.replace(/_/g, ' ')}. Press Resume in the desktop app, Email > Mailbox.`;
  } else {
    headline = 'Desktop app is online';
    color = 'var(--green, #22c55e)';
    detail = 'Mail waiting here is picked up within about 30 seconds and sent at your mailbox\'s own pace.';
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{headline}</span>
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.7 }}>{detail}</div>
      {waiting.length > 0 && (
        <div style={{ fontSize: '0.62rem', color: 'var(--dim)', marginTop: '0.5rem', lineHeight: 1.7 }}>
          {waiting.length} email{waiting.length === 1 ? '' : 's'} waiting.
          {oldestExpiry ? ` Anything not sent within ${until(oldestExpiry)} expires and is never sent late.` : ''}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: '1rem', maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem' }}>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_LABEL[r.status] || { text: r.status, color: 'var(--dim)' };
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.3rem' }}>
                      <div style={{ color: 'var(--white)' }}>{r.to_email}</div>
                      <div style={{ color: 'var(--dim)' }}>{r.subject}</div>
                      {r.error && !['sent', 'replied'].includes(r.status) && <div style={{ color: 'var(--red)' }}>{r.error}</div>}
                    </td>
                    <td style={{ padding: '0.5rem 0.3rem', whiteSpace: 'nowrap', color: s.color }}>
                      {s.text}
                      <div style={{ color: 'var(--dim2)' }}>{r.status === 'sent' || r.status === 'replied' ? ago(r.sent_at) : ago(r.created_at)}</div>
                    </td>
                    <td style={{ padding: '0.5rem 0.3rem', textAlign: 'right' }}>
                      {r.status === 'queued' && (
                        <button
                          onClick={() => cancel(r.id)}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', borderRadius: 4, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.58rem' }}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
