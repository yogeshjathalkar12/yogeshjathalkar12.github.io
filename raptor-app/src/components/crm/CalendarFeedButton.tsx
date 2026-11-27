import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { RAPTOR_API_URL } from '../../lib/config';
import { feedLink } from '../../lib/calendarFeed';
import Modal, { fieldInputStyle, toolBtnStyle, toolPrimaryStyle, ghostBtnStyle } from './Modal';

// "Calendar link": see your Raptor meetings and tasks in Google Calendar or Outlook. Shows nothing until
// 2026-11-28_m_calendar_feed.sql has been run.

const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.7, marginBottom: 12 };

export default function CalendarFeedButton() {
  const [installed, setInstalled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const { data, error: problem } = await supabase.rpc('calendar_feed_status');
    if (problem) { if (!isNotInstalled(problem)) setError(problem.message); return false; }
    setToken((data as any)?.token || null);
    setLastRead((data as any)?.last_read_at || null);
    return true;
  }
  useEffect(() => { refresh().then(setInstalled); }, []);

  async function run(name: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setCopied(false);
    const { error: problem } = await supabase.rpc(name, args);
    if (problem) setError(problem.message);
    await refresh();
    setBusy(false);
  }

  if (!installed) return null;
  const link = token ? feedLink(RAPTOR_API_URL, token) : '';

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { window.prompt('Copy this:', link); }
  }

  return (
    <>
      <button type="button" style={toolBtnStyle} onClick={() => { setCopied(false); setOpen(true); refresh(); }}>Calendar link</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your calendar link" width={520}>
        <div style={small}>
          See your booked meetings, deal meetings and tasks with a due time in Google Calendar or Outlook. It goes one way: what you change
          there does not change Raptor. Their calendars update on their own schedule, often only every few hours.
        </div>
        {!token ? (
          <button type="button" style={toolPrimaryStyle} disabled={busy} onClick={() => run('calendar_feed_link')}>Make my calendar link</button>
        ) : (
          <>
            <input style={fieldInputStyle} readOnly value={link} aria-label="Calendar address" onFocus={(e) => e.target.select()} />
            <div style={small}>
              <b>Google Calendar</b>: on a computer, next to “Other calendars” press +, choose “From URL” and paste the address.<br />
              <b>Outlook</b>: Add calendar, then “Subscribe from web”.<br />
              Anyone with this address can read these entries, so do not share it. {lastRead ? `Last read by a calendar: ${new Date(lastRead).toLocaleString()}.` : 'No calendar has read it yet.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={toolPrimaryStyle} onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
              <button type="button" style={ghostBtnStyle} disabled={busy} onClick={() => { if (confirm('Make a new address? The old one stops working.')) run('calendar_feed_link', { p_new: true }); }}>New address</button>
              <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)' }} disabled={busy} onClick={() => { if (confirm('Switch the calendar link off?')) run('calendar_feed_off'); }}>Switch off</button>
            </div>
          </>
        )}
        {error && <div role="alert" style={{ ...small, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
      </Modal>
    </>
  );
}
