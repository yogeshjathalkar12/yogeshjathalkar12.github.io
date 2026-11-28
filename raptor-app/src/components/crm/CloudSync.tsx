import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { toolApiBase } from '../../lib/config';
import { PROVIDER_NAMES, cloudReturn, showCloudPanel, withoutCloudParams, type CloudAccount, type CloudProvider, type CloudStatus } from '../../lib/cloudSync';
import { toolBtnStyle, toolPrimaryStyle } from './Modal';

// A person's own Google or Microsoft account: file mail with contacts on their history, and keep booking links in step with the
// calendar. Shows nothing while the server has this switched off.

const API = toolApiBase('cloud-sync');
const note = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.7 } as const;

async function call(method: string, path: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in again.');
  const resp = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: body ? JSON.stringify(body) : undefined });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'That did not work. Please try again.');
  return json;
}

export default function CloudSync({ onStatus }: { onStatus?: (status: CloudStatus | null) => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const finished = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await call('GET', '/status') as CloudStatus;
      setStatus(next);
      onStatus?.(next);
    } catch {
      setStatus(null);                                // an older server, or it is asleep: nothing is shown
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const back = cloudReturn(params);
    if (back && !finished.current) {
      finished.current = true;
      setParams(withoutCloudParams(params), { replace: true });      // the one-time code does not stay in the address
      if (back.failed) { setMessage('The account was not connected.'); load(); return; }
      call('POST', '/finish', { code: back.code, state: back.state })
        .then((out) => setMessage(`Connected ${out.email}. Choose below what Raptor may do with it.`))
        .catch((e) => setMessage(e.message))
        .finally(load);
      return;
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showCloudPanel(status) && !message) return null;

  async function run(name: string, work: () => Promise<unknown>, done = '') {
    setBusy(name);
    setMessage('');
    try {
      await work();
      setMessage(done);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy('');
      load();
    }
  }

  const connect = (provider: CloudProvider) => run(provider, async () => { const out = await call('POST', `/connect/${provider}`); window.location.assign(out.url); });
  const flip = (a: CloudAccount, patch: Partial<CloudAccount>) => run(a.provider, () => call('PUT', `/${a.provider}`, { mail_on: a.mail_on, calendar_on: a.calendar_on, ...patch }), 'Saved.');
  const accounts = status?.accounts || [];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1rem 1.2rem', marginBottom: '1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem' }}>Your mail and calendar</div>
      {accounts.map((a) => (
        <div key={a.provider} style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: '0.75rem' }}>{PROVIDER_NAMES[a.provider]}: {a.email}</div>
          <label style={{ ...note, display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <input type="checkbox" checked={a.calendar_on} disabled={!!busy} onChange={(e) => flip(a, { calendar_on: e.target.checked })} />
            <span>Calendar: booking links skip the times you are busy (times only, no titles), and new bookings appear in your calendar.</span>
          </label>
          <label style={{ ...note, display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
            <input type="checkbox" checked={a.mail_on} disabled={!!busy} onChange={(e) => flip(a, { mail_on: e.target.checked })} />
            <span>Mail: messages to or from your CRM contacts are added to their history (subject and the first lines), where your team can see them. Other mail is not stored.</span>
          </label>
          <div style={{ ...note, color: a.last_error ? 'var(--red)' : 'var(--dim)' }}>
            {a.last_error || (a.last_sync_at ? `Last synced ${new Date(a.last_sync_at).toLocaleString()}` : 'Not synced yet')}
          </div>
          <button type="button" style={{ ...toolBtnStyle, marginTop: 6 }} disabled={!!busy}
            onClick={() => { if (window.confirm(`Disconnect ${a.email}? Mail already added to contacts and calendar entries already made stay.`)) run(a.provider, () => call('DELETE', `/${a.provider}`), 'Disconnected.'); }}>Disconnect</button>
        </div>
      ))}
      {status?.open && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {status.providers.filter((p) => !accounts.some((a) => a.provider === p)).map((p) => (
            <button key={p} type="button" style={toolPrimaryStyle} disabled={!!busy} onClick={() => connect(p)}>Connect {PROVIDER_NAMES[p]}</button>
          ))}
          {accounts.some((a) => a.mail_on || a.calendar_on) && (
            <button type="button" style={toolBtnStyle} disabled={!!busy} onClick={() => run('sync', () => call('POST', '/sync'), 'Synced.')}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
          )}
        </div>
      )}
      {status?.open && <div style={note}>Calendars are read when you press Sync now and on the hourly run, so a very recent entry may not be skipped yet.</div>}
      {status && !status.open && accounts.length > 0 && <div style={note}>Syncing is switched off at the moment. You can still disconnect.</div>}
      {message && <div role="status" style={note}>{message}</div>}
    </div>
  );
}
