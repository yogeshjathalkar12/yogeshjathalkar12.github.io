import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';
import DesktopRelayStatus from './DesktopRelayStatus';

const EMAIL_API = toolApiBase('email');

type Security = 'starttls' | 'ssl';
// 'desktop' = the desktop app sends the mail (works everywhere, the password never reaches this server);
// 'smtp' = this server sends it over SMTP (only offered when the server has that switched on).
type Mode = 'desktop' | 'smtp';

// Mirrors SENDING_DEFAULTS in the backend's email router (which is the
// source of truth). Shown here only so people know what to expect.
const RAMP_START = 10;
const RAMP_TARGET = 20;
const RAMP_STEP_PER_DAY = 5;

const noteStyle = { fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6 } as const;

export default function EmailConnectionSetup() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  // The mailbox password (or app password).
  const [password, setPassword] = useState('');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState<Security>('starttls');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');

  const [acceptedRisks, setAcceptedRisks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether this server has mailbox sending switched on. Stays false if the
  // server doesn't say otherwise, so the form is never offered on a server
  // that can't deliver it.
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>('desktop');
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
      setSmtpEnabled(body.smtp === true);
      setRisksStatement(typeof body.risks_statement === 'string' ? body.risks_statement : '');
      setRisksVersion(typeof body.risks_version === 'string' ? body.risks_version : '');
    } catch {
      /* leave mailbox sending switched off */
    }
  }

  async function fetchAccounts() {
    try {
      // Read directly via Supabase — RLS already scopes this to the
      // caller's own rows, and encrypted_api_key never gets selected here
      // (only used server-side). smtp_config holds only the non-secret
      // settings (host, port, username), never the password.
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, label, provider, from_email, from_name, daily_cap, warmup_target, smtp_config, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to load email accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  function smtpConfig() {
    return {
      host: smtpHost.trim(),
      port: Number(smtpPort) || undefined,
      username: (smtpUser.trim() || fromEmail.trim()),
      security: smtpSecurity,
    };
  }

  function changeSecurity(next: Security) {
    setSmtpSecurity(next);
    setSmtpPort(next === 'ssl' ? '465' : '587');
    setTestOk(false);
  }

  async function handleTest() {
    if (!smtpHost.trim() || !password.trim()) {
      setError('Enter the mail server and password first.');
      return;
    }
    setTesting(true);
    setError(null);
    setTestOk(false);
    try {
      const resp = await fetch(`${EMAIL_API}/accounts/test-smtp`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ smtp_config: smtpConfig(), password }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.detail || `Connection test failed (${resp.status}).`);
      setTestOk(true);
    } catch (err: any) {
      setError(err.message || 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const viaDesktop = mode === 'desktop' || !smtpEnabled;
    if (!label.trim() || !fromEmail.trim() || !fromName.trim()) return;
    if (!viaDesktop && !password.trim()) return;
    if (!viaDesktop && !smtpHost.trim()) {
      setError('Enter your mail server, like smtp.gmail.com.');
      return;
    }
    if (!acceptedRisks || !risksVersion) {
      setError('Please confirm you understand your responsibilities before connecting.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Creation goes through the backend, not a direct insert — the
      // password needs to be encrypted server-side before it ever reaches
      // Postgres. The frontend never holds the encryption key.
      const resp = await fetch(`${EMAIL_API}/accounts`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify(viaDesktop
          ? {
              label: label.trim(),
              provider: 'desktop',
              from_email: fromEmail.trim(),
              from_name: fromName.trim(),
              accepted_risks_version: risksVersion,
            }
          : {
              label: label.trim(),
              provider: 'smtp',
              from_email: fromEmail.trim(),
              from_name: fromName.trim(),
              api_key: password.trim(),
              smtp_config: smtpConfig(),
              accepted_risks_version: risksVersion,
            }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Could not save this account (${resp.status}).`);
      }

      setLabel('');
      setFromEmail('');
      setFromName('');
      setPassword('');
      setSmtpHost('');
      setSmtpUser('');
      setAcceptedRisks(false);
      setTestOk(false);
      fetchAccounts();
    } catch (err: any) {
      console.error('Failed to save email account:', err);
      setError(err.message || 'Could not save this account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this sending account? Its campaigns and contacts stay in your account but stop sending.')) return;
    await supabase.from('email_accounts').delete().eq('id', id);
    fetchAccounts();
  }

  // Without the server's SMTP switch there is only one way to connect, so never show a form that can't work.
  const viaDesktop = mode === 'desktop' || !smtpEnabled;

  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620, lineHeight: 1.7 }}>
        Send from your own mailbox. Nothing routes through a shared identity — every send uses your own login, your own warm-up ramp and your own suppression list.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>Connect your mailbox</div>

        {smtpEnabled && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button type="button" onClick={() => setMode('desktop')} style={{ ...primaryBtnStyle, ...(mode === 'desktop' ? {} : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)' }) }}>
              Send via my desktop app
            </button>
            <button type="button" onClick={() => setMode('smtp')} style={{ ...primaryBtnStyle, ...(mode === 'smtp' ? {} : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)' }) }}>
              Send from this server
            </button>
          </div>
        )}

        {viaDesktop ? (
          <div style={{ ...noteStyle, marginBottom: '1rem' }}>
            Your Raptor desktop app sends the mail, from the mailbox connected there, at that mailbox's own pace. The mailbox password never reaches our servers. Mail you schedule here waits safely and goes out while the desktop app is open and signed in; anything still unsent 48 hours after its time expires instead of going out late.
          </div>
        ) : (
          <div style={{ ...noteStyle, marginBottom: '1rem' }}>
            Works with Google Workspace, Microsoft 365, Zoho or any provider that gives you SMTP details. Gmail and Microsoft accounts need an app password, not your normal password. A separate sending domain is safer than your main one. Your password is encrypted before it's stored.
          </div>
        )}

        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Label (e.g. Raptor outreach)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={fieldInputStyle} placeholder={viaDesktop ? 'Your mailbox address (as connected in the desktop app)' : 'From email'} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          <input style={fieldInputStyle} placeholder="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          {!viaDesktop && <>
          <input style={fieldInputStyle} placeholder="Mail server (e.g. smtp.gmail.com)" value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); setTestOk(false); }} />
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <select style={{ ...fieldInputStyle, flex: 2 }} value={smtpSecurity} onChange={(e) => changeSecurity(e.target.value as Security)} aria-label="Connection type">
              <option value="starttls">STARTTLS (usually port 587)</option>
              <option value="ssl">SSL/TLS (usually port 465)</option>
            </select>
            <input style={{ ...fieldInputStyle, flex: 1 }} placeholder="Port" inputMode="numeric" value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); setTestOk(false); }} aria-label="Port" />
          </div>
          <input style={fieldInputStyle} placeholder="Username (leave blank to use your From email)" value={smtpUser} onChange={(e) => { setSmtpUser(e.target.value); setTestOk(false); }} />
          <input style={fieldInputStyle} placeholder="Password or app password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setTestOk(false); }} />
          <button type="button" style={{ ...primaryBtnStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)' }} disabled={testing} onClick={handleTest}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testOk && <div style={{ color: 'var(--green, #22c55e)', fontSize: '0.65rem' }}>Connected. Nothing was sent. You can save it now.</div>}
          </>}

          <div style={noteStyle}>
            Starts at {RAMP_START} emails a day and grows by {RAMP_STEP_PER_DAY} a day up to {RAMP_TARGET}. The ramp protects your mailbox's reputation.
          </div>

          <label style={{ ...noteStyle, display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={acceptedRisks} disabled={!risksVersion} onChange={(e) => setAcceptedRisks(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{risksStatement || 'Loading…'}</span>
          </label>

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>

      {accounts.some((a) => a.provider === 'desktop') && <DesktopRelayStatus />}

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
        Connected Accounts
      </div>
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No accounts connected yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>
                  {a.label}{' '}
                  <span style={{ fontSize: '0.55rem', color: 'var(--purple)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    {a.provider === 'desktop' ? 'Desktop app' : `SMTP · ${a.smtp_config?.host ?? ''}`}
                  </span>
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{a.from_email} · cap {a.daily_cap}/day, ramping to {a.warmup_target}</div>
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
