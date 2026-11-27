import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import CalendarFeedButton from '../../components/crm/CalendarFeedButton';
import { shortName } from '../../lib/team';
import { isNotInstalled } from '../../lib/dbMissing';
import {
  type Booking, type BookingDraft, type BookingMail, type BookingPage, type EmailMode, DAY_NAMES, EMAIL_MODES, REMINDERS, bookingLink, bookingProblem,
  bookingRow, draftOfPage, mailLines, newDraft, splitBookings, summaryOf,
} from '../../lib/booking';
import { useColumn } from '../../hooks/useColumn';
import { RAPTOR_API_URL } from '../../lib/config';

// CRM > Booking: links where people pick a free time with someone on the team (db/migrations/2026-11-28_l_booking.sql).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.3rem' };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };
const check: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', marginBottom: 8 };
const pair: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', columnGap: 12 };

const myZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
function zones(current: string): string[] {
  const list: string[] = (Intl as any).supportedValuesOf?.('timeZone') || [];
  return Array.from(new Set(['UTC', current, myZone(), ...list])).sort();
}

export default function CrmBooking() {
  const { isOwner, can } = useOrg();
  const manage = isOwner || can('manage_automations');
  const { entries } = useDirectory();
  const me = entries.find((e) => e.is_me)?.user_id || '';
  const [pages, setPages] = useState<BookingPage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; draft: BookingDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [showPast, setShowPast] = useState(false);
  const emails = useColumn('booking_pages', 'email_mode') === true;
  const [mails, setMails] = useState<BookingMail[]>([]);
  const [serverSends, setServerSends] = useState<boolean | null>(null);     // can the server send from Raptor's address?
  const mailServer = `${RAPTOR_API_URL}/api/raptor/booking-mail`;

  async function loadMails() {
    const { data, error } = await supabase.from('booking_mail').select('booking_id, kind, channel, status, error, send_after, sent_at').order('created_at', { ascending: false }).limit(600);
    if (!error) setMails((data || []) as BookingMail[]);
  }
  useEffect(() => {
    if (!emails) return;
    loadMails();
    fetch(`${mailServer}/status`).then((r) => (r.ok ? r.json() : null)).then((out) => setServerSends(out ? !!out.configured : null)).catch(() => setServerSends(null));
  }, [emails]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const [p, b] = await Promise.all([
      supabase.from('booking_pages').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*').order('starts_at', { ascending: false }).limit(200),
    ]);
    const error = p.error || b.error;
    if (error) {
      setState(isNotInstalled(error) ? 'missing' : 'error');
      setMessage(error.message);
      return;
    }
    setPages((p.data || []) as BookingPage[]);
    setBookings((b.data || []) as Booking[]);
    setState('ready');
  }
  useEffect(() => { load(); }, []);

  const set = (patch: Partial<BookingDraft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const mayEdit = (page: BookingPage) => manage || page.host_id === me;
  const person = (id: string) => shortName(entries.find((e) => e.user_id === id)?.email) || 'A teammate';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const draft = { ...editing.draft, host_id: editing.draft.host_id || me };
    const wrong = bookingProblem(draft);
    if (wrong) { setProblem(wrong); return; }
    setSaving(true);
    setProblem(null);
    const row = bookingRow(draft, emails);
    const { error } = editing.id
      ? await supabase.from('booking_pages').update(row).eq('id', editing.id)
      : await supabase.from('booking_pages').insert(row);
    setSaving(false);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this booking page? Its link stops working. Meetings already booked stay.')) return;
    const { error } = await supabase.from('booking_pages').delete().eq('id', id);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function cancel(b: Booking) {
    const mode = pages.find((p) => p.id === b.page_id)?.email_mode || 'off';
    const told = mode === 'off' ? `Raptor does not email them: tell them yourself (${b.email}).` : `A cancellation email goes to ${b.email}.`;
    if (!confirm(`Cancel the meeting with ${b.name}? ${told}`)) return;
    const { error } = await supabase.rpc('booking_team_cancel', { p_id: b.id });
    if (error) { alert(error.message); return; }
    if (mode === 'raptor' && b.cancel_token) {
      // asks the server to send the cancellation now; if this fails the hourly run sends it
      await fetch(`${mailServer}/flush`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: b.cancel_token }) }).catch(() => undefined);
    }
    load();
    if (emails) loadMails();
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  if (state === 'loading') return <div style={small}>Loading booking pages…</div>;
  if (state === 'missing') return <div style={card}><div style={small}>Booking links need a database update first: run <b>2026-11-28_l_booking.sql</b> in Supabase.</div></div>;
  if (state === 'error') return <div style={card}><div style={{ ...small, color: 'var(--red)' }}>Could not load the booking pages: {message}</div></div>;

  const { upcoming, past } = splitBookings(bookings);
  const d = editing?.draft;

  const row = (b: Booking, canCancel: boolean) => (
    <tr key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{new Date(b.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
      <td style={{ padding: '0.5rem 0.4rem' }}>
        {b.contact_id ? <a style={{ color: 'var(--purple)' }} href={`#/crm/contacts?open=${b.contact_id}`}>{b.name}</a> : b.name}
        <div style={{ color: 'var(--dim)' }}>{b.email}{b.phone ? ` · ${b.phone}` : ''}</div>
        {b.message && <div style={{ color: 'var(--dim)', maxWidth: 360 }}>{b.message}</div>}
        {mailLines(mails.filter((m) => m.booking_id === b.id), (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
          .map((line) => <div key={line.text} style={{ fontSize: '0.58rem', color: line.bad ? 'var(--red)' : 'var(--dim2)' }}>✉ {line.text}</div>)}
      </td>
      <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)' }}>{b.title}<div>with {person(b.host_id)}</div></td>
      <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>
        {b.status === 'cancelled'
          ? <span style={{ color: 'var(--dim)' }}>Cancelled by {b.cancelled_by === 'visitor' ? 'them' : 'your team'}</span>
          : canCancel && (manage || b.host_id === me) && <button style={toolBtnStyle} onClick={() => cancel(b)}>Cancel</button>}
      </td>
    </tr>
  );

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        <div style={{ ...small, maxWidth: 600 }}>
          Share a link and people pick a free time. A booking adds the contact, a task and a notification. Free times come from your hours here,
          other bookings and deal meetings: your Google or Outlook calendar is not checked.{emails ? '' : ' No email is sent to the visitor.'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          <CalendarFeedButton />
          <button style={toolPrimaryStyle} onClick={() => { setProblem(null); setEditing({ id: null, draft: newDraft(me, myZone()) }); }}>+ New booking page</button>
        </div>
      </div>

      {pages.length === 0 && <div style={{ ...card, textAlign: 'center' }}><div style={small}>No booking pages yet.</div></div>}
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        {pages.map((p) => (
          <div key={p.id} style={{ ...card, opacity: p.enabled ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>{p.name}</div>
                <div style={small}>{p.enabled ? 'On' : 'Off'} · with {person(p.host_id)} · {summaryOf(p)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a style={toolBtnStyle} href={bookingLink(p.token)} target="_blank" rel="noopener noreferrer">Open</a>
                <button style={toolBtnStyle} onClick={() => copy(p.id, bookingLink(p.token))}>{copied === p.id ? 'Copied' : 'Copy link'}</button>
                {mayEdit(p) && <button style={toolBtnStyle} onClick={() => { setProblem(null); setEditing({ id: p.id, draft: draftOfPage(p) }); }}>Edit</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: '1.2rem', overflowX: 'auto' }}>
        <div style={{ ...fieldLabelStyle, marginBottom: 10 }}>Coming up</div>
        {upcoming.length === 0 ? <div style={small}>No meetings coming up.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}><tbody>{upcoming.map((b) => row(b, true))}</tbody></table>
        )}
        {past.length > 0 && (
          <>
            <button style={{ ...toolBtnStyle, marginTop: 12 }} onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide' : 'Show'} past and cancelled ({past.length})</button>
            {showPast && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', marginTop: 8 }}><tbody>{past.map((b) => row(b, false))}</tbody></table>}
          </>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit booking page' : 'New booking page'} width={520}>
        {d && (
          <form onSubmit={save} noValidate>
            <label style={fieldLabelStyle} htmlFor="bk-name">Name (only your team sees it)</label>
            <input id="bk-name" style={fieldInputStyle} value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="bk-host">Meetings are with</label>
            <select id="bk-host" style={fieldInputStyle} value={d.host_id || me} onChange={(e) => set({ host_id: e.target.value })} disabled={!manage}>
              {entries.map((m) => <option key={m.user_id} value={m.user_id}>{shortName(m.email)}{m.is_me ? ' (me)' : ''}</option>)}
            </select>
            <label style={fieldLabelStyle} htmlFor="bk-title">Heading</label>
            <input id="bk-title" style={fieldInputStyle} value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="bk-intro">Introduction (optional)</label>
            <textarea id="bk-intro" style={{ ...fieldInputStyle, minHeight: 56 }} value={d.intro} maxLength={500} onChange={(e) => set({ intro: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="bk-where">Where you meet (shown only after booking)</label>
            <input id="bk-where" style={fieldInputStyle} value={d.location} maxLength={300} placeholder="Your video call link, phone or address" onChange={(e) => set({ location: e.target.value })} />
            <div style={pair}>
              <div><label style={fieldLabelStyle} htmlFor="bk-min">Length (minutes)</label><input id="bk-min" style={fieldInputStyle} type="number" value={d.minutes} onChange={(e) => set({ minutes: e.target.value })} /></div>
              <div><label style={fieldLabelStyle} htmlFor="bk-gap">Break between (minutes)</label><input id="bk-gap" style={fieldInputStyle} type="number" value={d.buffer_minutes} onChange={(e) => set({ buffer_minutes: e.target.value })} /></div>
              <div><label style={fieldLabelStyle} htmlFor="bk-from">Day starts</label><input id="bk-from" style={fieldInputStyle} type="time" value={d.start_time} onChange={(e) => set({ start_time: e.target.value })} /></div>
              <div><label style={fieldLabelStyle} htmlFor="bk-to">Day ends</label><input id="bk-to" style={fieldInputStyle} type="time" value={d.end_time} onChange={(e) => set({ end_time: e.target.value })} /></div>
              <div><label style={fieldLabelStyle} htmlFor="bk-notice">Notice needed (hours)</label><input id="bk-notice" style={fieldInputStyle} type="number" value={d.notice_hours} onChange={(e) => set({ notice_hours: e.target.value })} /></div>
              <div><label style={fieldLabelStyle} htmlFor="bk-ahead">Days ahead</label><input id="bk-ahead" style={fieldInputStyle} type="number" value={d.days_ahead} onChange={(e) => set({ days_ahead: e.target.value })} /></div>
            </div>
            <div style={{ ...fieldLabelStyle, marginBottom: 8 }}>Days</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {DAY_NAMES.map(([n, label]) => (
                <label key={n} style={{ ...check, marginBottom: 0 }}>
                  <input type="checkbox" checked={d.days.includes(n)} onChange={(e) => set({ days: e.target.checked ? [...d.days, n] : d.days.filter((x) => x !== n) })} /> {label}
                </label>
              ))}
            </div>
            <label style={fieldLabelStyle} htmlFor="bk-zone">Time zone of those hours</label>
            <select id="bk-zone" style={fieldInputStyle} value={d.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {zones(d.timezone).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <div style={{ ...fieldLabelStyle, marginBottom: 8 }}>Name and email are always asked. Also ask for:</div>
            <label style={check}><input type="checkbox" checked={d.ask_phone} onChange={(e) => set({ ask_phone: e.target.checked })} /> Phone</label>
            <label style={check}><input type="checkbox" checked={d.ask_message} onChange={(e) => set({ ask_message: e.target.checked })} /> A note</label>
            {emails && (
              <>
                <label style={fieldLabelStyle} htmlFor="bk-mail">Emails to the visitor (confirmation, reminder, cancellation)</label>
                <select id="bk-mail" style={fieldInputStyle} value={d.email_mode} onChange={(e) => set({ email_mode: e.target.value as EmailMode })}>
                  {EMAIL_MODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                {d.email_mode === 'raptor' && (
                  <div style={{ ...small, marginTop: -6, marginBottom: 12 }}>
                    Sent from bookings@shoonyaorigins.com within moments; replies go to the person the meeting is with. Up to 100 a day. Reminders go out on the hourly run.
                    {serverSends === false && <div style={{ color: 'var(--red)' }}>The Raptor server cannot send email yet (no sending key is set).</div>}
                  </div>
                )}
                {d.email_mode === 'mine' && (
                  <div style={{ ...small, marginTop: -6, marginBottom: 12 }}>
                    Sent by the PC app of the person the meeting is with: needs a paid plan, their mailbox connected there and the app open. It follows that mailbox’s sending hours and daily limit, so an email can arrive later.
                  </div>
                )}
                {d.email_mode !== 'off' && (
                  <>
                    <label style={fieldLabelStyle} htmlFor="bk-remind">Reminder</label>
                    <select id="bk-remind" style={fieldInputStyle} value={d.reminder_hours} onChange={(e) => set({ reminder_hours: Number(e.target.value) })}>
                      {REMINDERS.map(([hours, label]) => <option key={hours} value={hours}>{label}</option>)}
                    </select>
                  </>
                )}
              </>
            )}
            <label style={check}><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> The page is on</label>
            {problem && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {editing?.id && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => remove(editing.id as string)}>Delete</button>}
              <button type="button" style={ghostBtnStyle} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={saving}>{saving ? 'Saving…' : 'Save page'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
