import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';
import DesktopRelayStatus from './DesktopRelayStatus';

const EMAIL_API = toolApiBase('email');

// Same providers, in the same words, as the desktop app's mailbox screen (raptor-ui/src/pages/email/Mailbox.js):
// people pick a name and paste an app password; the servers are filled in (and can still be edited).
const PRESETS: Record<string, { label: string; smtp_host: string; smtp_security: 'starttls' | 'ssl'; smtp_port: string; imap_host: string }> = {
  gmail: { label: 'Gmail / Google Workspace', smtp_host: 'smtp.gmail.com', smtp_security: 'starttls', smtp_port: '587', imap_host: 'imap.gmail.com' },
  outlook: { label: 'Outlook / Microsoft 365', smtp_host: 'smtp.office365.com', smtp_security: 'starttls', smtp_port: '587', imap_host: 'outlook.office365.com' },
  zoho: { label: 'Zoho Mail (India: use .in)', smtp_host: 'smtp.zoho.com', smtp_security: 'ssl', smtp_port: '465', imap_host: 'imap.zoho.com' },
  yahoo: { label: 'Yahoo Mail', smtp_host: 'smtp.mail.yahoo.com', smtp_security: 'ssl', smtp_port: '465', imap_host: 'imap.mail.yahoo.com' },
  other: { label: 'Another provider', smtp_host: '', smtp_security: 'starttls', smtp_port: '587', imap_host: '' },
};

const RAMP_STEP_PER_DAY = 5;

const noteStyle = { fontSize: '0.78rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const labelStyle = { display: 'block', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.3rem' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.8rem' } as const;
const ghostBtnStyle = { ...primaryBtnStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)' } as const;

function emptyForm() {
  return {
    address: '', from_name: '', username: '', password: '', signature: '',
    ...PRESETS.gmail,
    daily_cap: '10', warmup_target: '20', hours_start: '9', hours_end: '19', weekdays_only: true, icp_threshold: '70',
  };
}

export default function EmailConnectionSetup() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // With a mailbox already connected the form stays closed until "Add another mailbox" is pressed.
  const [showForm, setShowForm] = useState(false);

  const [preset, setPreset] = useState('gmail');
  const [form, setForm] = useState(emptyForm());
  const [acceptedRisks, setAcceptedRisks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The responsibilities statement and its version come from the server, so
  // the wording shown is exactly the wording that gets recorded.
  const [risksStatement, setRisksStatement] = useState('');
  const [risksVersion, setRisksVersion] = useState('');

  useEffect(() => {
    fetchAccounts();
    loadProviders();
  }, []);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in.');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  }

  async function loadProviders() {
    try {
      const resp = await fetch(`${EMAIL_API}/providers`, { headers: await authHeader() });
      if (!resp.ok) return;
      const body = await resp.json();
      setRisksStatement(typeof body.risks_statement === 'string' ? body.risks_statement : '');
      setRisksVersion(typeof body.risks_version === 'string' ? body.risks_version : '');
    } catch {
      /* the statement stays "Loading…" and Connect stays disabled until it arrives */
    }
  }

  async function fetchAccounts() {
    try {
      // Read directly via Supabase: RLS scopes this to the caller's own rows, and the encrypted password is never
      // selected here (only the desktop app fetches it, through the server).
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, label, provider, from_email, from_name, daily_cap, warmup_target, business_hours_start, business_hours_end, smtp_config, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to load email accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  const setField = (key: keyof ReturnType<typeof emptyForm>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  function pickPreset(key: string) {
    setPreset(key);
    const p = PRESETS[key];
    setForm((f) => ({ ...f, smtp_host: p.smtp_host, smtp_security: p.smtp_security, smtp_port: p.smtp_port, imap_host: p.imap_host }));
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const address = form.address.trim();
    if (!address || !form.from_name.trim()) { setError('Enter your email address and the name recipients should see.'); return; }
    if (!form.password.trim()) { setError('Enter the app password for this mailbox.'); return; }
    if (!form.smtp_host.trim()) { setError('Enter your mail server, like smtp.gmail.com.'); return; }
    if (!acceptedRisks || !risksVersion) { setError('Please confirm you understand your responsibilities before connecting.'); return; }

    setSaving(true);
    try {
      // Creation goes through the server so the password is encrypted there before it is saved. The frontend never
      // holds the encryption key.
      const resp = await fetch(`${EMAIL_API}/accounts`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({
          label: address,
          provider: 'desktop',
          from_email: address,
          from_name: form.from_name.trim(),
          api_key: form.password.trim(),
          smtp_config: {
            host: form.smtp_host.trim(),
            port: Number(form.smtp_port) || undefined,
            username: form.username.trim() || address,
            security: form.smtp_security,
            imap_host: form.imap_host.trim(),
            signature: form.signature.trim(),
            weekdays_only: form.weekdays_only,
            icp_threshold: Number(form.icp_threshold),
          },
          daily_cap: Number(form.daily_cap),
          warmup_target: Number(form.warmup_target),
          hours_start: Number(form.hours_start),
          hours_end: Number(form.hours_end),
          accepted_risks_version: risksVersion,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Could not save this mailbox (${resp.status}).`);
      }
      setForm(emptyForm());
      setPreset('gmail');
      setAcceptedRisks(false);
      setShowForm(false);
      setNotice('Mailbox saved. Your Raptor desktop app picks it up and checks the login the first time it sends.');
      fetchAccounts();
    } catch (err: any) {
      console.error('Failed to save email account:', err);
      setError(err.message || 'Could not save this mailbox.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this mailbox? Its campaigns and contacts stay in your account but stop sending.')) return;
    await supabase.from('email_accounts').delete().eq('id', id);
    fetchAccounts();
  }

  const hasAccounts = accounts.length > 0;

  const formCard = (
    <form
      className="mailbox-card"
      onSubmit={handleConnect}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
    >
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem' }}>{hasAccounts ? 'Add another mailbox' : 'Connect your mailbox'}</div>
      <div style={noteStyle}>
        Gmail and Microsoft accounts need an <strong>app password</strong>, not your normal password (in your account's security settings).
        IMAP must be switched on so Raptor can see replies and bounces. A separate sending domain is safer than your main one.
        Your password is saved encrypted on our servers and is used only by your own Raptor desktop app, to log in to your mailbox.
      </div>

      <div>
        <label style={labelStyle}>Provider</label>
        <select style={fieldInputStyle} value={preset} onChange={(e) => pickPreset(e.target.value)}>
          {Object.entries(PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
        </select>
      </div>

      <div style={rowStyle}>
        <div><label style={labelStyle}>Your email address</label><input style={fieldInputStyle} value={form.address} onChange={setField('address')} placeholder="you@yourcompany.com" /></div>
        <div><label style={labelStyle}>Name recipients see</label><input style={fieldInputStyle} value={form.from_name} onChange={setField('from_name')} placeholder="Ravi from Acme" /></div>
      </div>
      <div style={rowStyle}>
        <div><label style={labelStyle}>Username (blank = your address)</label><input style={fieldInputStyle} value={form.username} onChange={setField('username')} /></div>
        <div><label style={labelStyle}>App password</label><input style={fieldInputStyle} type="password" value={form.password} onChange={setField('password')} autoComplete="off" /></div>
      </div>

      <div style={rowStyle}>
        <div><label style={labelStyle}>Mail server (SMTP)</label><input style={fieldInputStyle} value={form.smtp_host} onChange={setField('smtp_host')} placeholder="smtp.gmail.com" /></div>
        <div><label style={labelStyle}>Inbox server (IMAP)</label><input style={fieldInputStyle} value={form.imap_host} onChange={setField('imap_host')} placeholder="imap.gmail.com" /></div>
      </div>
      <div style={rowStyle}>
        <div>
          <label style={labelStyle}>Connection type</label>
          <select
            style={fieldInputStyle}
            value={form.smtp_security}
            onChange={(e) => { const v = e.target.value as 'starttls' | 'ssl'; setForm((f) => ({ ...f, smtp_security: v, smtp_port: v === 'ssl' ? '465' : '587' })); }}
          >
            <option value="starttls">STARTTLS (port 587)</option>
            <option value="ssl">SSL/TLS (port 465)</option>
          </select>
        </div>
        <div><label style={labelStyle}>Port</label><input style={fieldInputStyle} value={form.smtp_port} onChange={setField('smtp_port')} inputMode="numeric" /></div>
      </div>

      <div>
        <label style={labelStyle}>Signature (your business name and postal address, added to every email)</label>
        <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} rows={3} value={form.signature} onChange={setField('signature')} placeholder={'Acme Pvt Ltd\n12 MG Road, Pune 411001'} />
      </div>

      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem', marginTop: '0.4rem' }}>Sending rules</div>
      <div style={rowStyle}>
        <div><label style={labelStyle}>First-day limit</label><input style={fieldInputStyle} value={form.daily_cap} onChange={setField('daily_cap')} inputMode="numeric" /></div>
        <div><label style={labelStyle}>Grows to (max per day)</label><input style={fieldInputStyle} value={form.warmup_target} onChange={setField('warmup_target')} inputMode="numeric" /></div>
      </div>
      <div style={noteStyle}>The limit grows by {RAMP_STEP_PER_DAY} a day until it reaches the maximum. This protects your mailbox's reputation.</div>
      <div style={rowStyle}>
        <div><label style={labelStyle}>Send from hour (0-23)</label><input style={fieldInputStyle} value={form.hours_start} onChange={setField('hours_start')} inputMode="numeric" /></div>
        <div><label style={labelStyle}>Until hour (1-24)</label><input style={fieldInputStyle} value={form.hours_end} onChange={setField('hours_end')} inputMode="numeric" /></div>
      </div>
      <label style={{ ...noteStyle, display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.weekdays_only} onChange={setField('weekdays_only')} /> Weekdays only
      </label>
      <div>
        <label style={labelStyle}>Automatic pitches: only send without asking if fit score is at least</label>
        <input style={{ ...fieldInputStyle, maxWidth: 120 }} value={form.icp_threshold} onChange={setField('icp_threshold')} inputMode="numeric" />
      </div>
      <div style={noteStyle}>Pitches generated for you that score lower, or that didn't pass validation, wait for your approval.</div>

      <label style={{ ...noteStyle, display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={acceptedRisks} disabled={!risksVersion} onChange={(e) => setAcceptedRisks(e.target.checked)} style={{ marginTop: 2 }} />
        <span>{risksStatement || 'Loading…'}</span>
      </label>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save and connect mailbox'}</button>
        {hasAccounts && (
          <button type="button" style={ghostBtnStyle} onClick={() => { setShowForm(false); setError(null); }}>Cancel</button>
        )}
      </div>
    </form>
  );

  const accountList = (
    <>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
        {hasAccounts ? 'Your connected mailboxes' : 'Connected Accounts'}
      </div>
      {accounts.length === 0 ? (
        <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No accounts connected yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '0.7rem', alignItems: 'start' }}>
          {accounts.map((a) => {
            const cfg = a.smtp_config || {};
            const stored = !!cfg.host;                  // a mailbox saved with its settings (older desktop connections have none)
            return (
              <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--white)', overflowWrap: 'anywhere' }}>
                    {a.from_email}{' '}
                    <span style={{ fontSize: '0.55rem', color: 'var(--purple)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{a.from_name}</span>
                  </div>
                  {stored ? (
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6 }}>
                      {cfg.host}{cfg.imap_host ? ` · inbox ${cfg.imap_host}` : ''}<br />
                      {a.daily_cap}/day, growing to {a.warmup_target} · {a.business_hours_start}:00 to {a.business_hours_end}:00{cfg.weekdays_only === false ? '' : ' · weekdays only'}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6 }}>
                      {a.provider === 'desktop'
                        ? 'Connected through the desktop app. Add it again here to save its settings and password.'
                        : `SMTP · ${cfg.host ?? ''}`} · cap {a.daily_cap}/day, ramping to {a.warmup_target}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(a.id)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620, lineHeight: 1.7 }}>
        Send from your own mailbox. Nothing routes through a shared identity — every send uses your own login, your own warm-up ramp and your own suppression list.
      </div>
      {notice && <div style={{ color: 'var(--green, #22c55e)', fontSize: '0.65rem', marginBottom: '1rem' }}>{notice}</div>}

      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>
      ) : hasAccounts ? (
        <>
          {accountList}
          <div style={{ height: '1.4rem' }} />
          {accounts.some((a) => a.provider === 'desktop') && <DesktopRelayStatus />}
          {showForm ? formCard : (
            <button type="button" style={ghostBtnStyle} onClick={() => { setShowForm(true); setNotice(null); }}>
              + Add another mailbox
            </button>
          )}
        </>
      ) : (
        <>
          {formCard}
          {accountList}
        </>
      )}
    </div>
  );
}
