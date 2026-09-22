import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';

const EMAIL_API = toolApiBase('email');

type Provider = 'resend' | 'smtp';
type ResendPlan = 'free' | 'paid';
type Security = 'starttls' | 'ssl';

// Mirrors SENDING_DEFAULTS in the backend's email router (which is the
// source of truth). Shown here only so people know what to expect.
const RAMP_STEP_PER_DAY = 5;
function rampSummary(provider: Provider, plan: ResendPlan): string {
  const [start, target] = provider === 'smtp' ? [10, 40] : plan === 'paid' ? [20, 300] : [20, 100];
  return `Starts at ${start} emails a day and grows by ${RAMP_STEP_PER_DAY} a day up to ${target}.`;
}

const noteStyle = { fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6 } as const;

function toggleStyle(active: boolean) {
  return {
    flex: 1,
    padding: '0.55rem 0.6rem',
    fontSize: '0.62rem',
    cursor: 'pointer',
    borderRadius: '4px',
    border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
    background: active ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--white)' : 'var(--dim)',
  } as const;
}

export default function EmailConnectionSetup() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<Provider>('resend');
  const [label, setLabel] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  // The Resend API key, or the mailbox password when connecting over SMTP.
  const [apiKey, setApiKey] = useState('');
  const [plan, setPlan] = useState<ResendPlan>('free');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState<Security>('starttls');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether this server has mailbox (SMTP) sending switched on. Stays false
  // if the server doesn't say otherwise, so the option is never offered
  // on a server that can't deliver it.
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  useEffect(() => {
    fetchAccounts();
    loadProviders();
  }, []);

  async function loadProviders() {
    try {
      const resp = await fetch(`${EMAIL_API}/providers`, { headers: await authHeader() });
      if (!resp.ok) return;
      const body = await resp.json();
      setSmtpEnabled(body.smtp === true);
    } catch {
      /* leave SMTP switched off */
    }
  }

  async function fetchAccounts() {
    try {
      // Still read directly via Supabase — RLS already scopes this to the
      // caller's own rows, and encrypted_api_key never gets selected here
      // anyway (only used server-side). smtp_config holds only the
      // non-secret settings (host, port, username), never the password.
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

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in.');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  }

  function changeProvider(next: Provider) {
    setProvider(next);
    setError(null);
    setTestOk(false);
    setApiKey('');
  }

  function changeSecurity(next: Security) {
    setSmtpSecurity(next);
    setSmtpPort(next === 'ssl' ? '465' : '587');
    setTestOk(false);
  }

  async function handleTest() {
    if (!smtpHost.trim() || !apiKey.trim()) {
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
        body: JSON.stringify({ smtp_config: smtpConfig(), password: apiKey }),
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
    if (!label.trim() || !fromEmail.trim() || !fromName.trim() || !apiKey.trim()) return;
    if (provider === 'smtp' && !smtpHost.trim()) {
      setError('Enter your mail server, like smtp.gmail.com.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Creation goes through the backend, not a direct insert — the
      // secret needs to be encrypted server-side before it ever reaches
      // Postgres. The frontend never holds the encryption key.
      const resp = await fetch(`${EMAIL_API}/accounts`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({
          label: label.trim(),
          provider,
          from_email: fromEmail.trim(),
          from_name: fromName.trim(),
          api_key: apiKey.trim(),
          ...(provider === 'resend' ? { plan } : { smtp_config: smtpConfig() }),
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Could not save this account (${resp.status}).`);
      }

      setLabel('');
      setFromEmail('');
      setFromName('');
      setApiKey('');
      setSmtpHost('');
      setSmtpUser('');
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

  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620, lineHeight: 1.7 }}>
        Connect your own sending account. Nothing routes through a shared identity — every send uses your own credentials, warm-up ramp, and suppression list. Your password or API key is encrypted before it's stored.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>Connect a sending account</div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
          <button type="button" style={toggleStyle(provider === 'resend')} onClick={() => changeProvider('resend')}>
            Resend
          </button>
          <button
            type="button"
            style={{ ...toggleStyle(provider === 'smtp'), ...(smtpEnabled ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }}
            disabled={!smtpEnabled}
            onClick={() => changeProvider('smtp')}
          >
            My own mailbox (SMTP)
          </button>
        </div>
        {!smtpEnabled && (
          <div style={{ ...noteStyle, marginBottom: '0.9rem' }}>
            Sending from your own mailbox isn't available on this server yet. Resend works today.
          </div>
        )}

        <div style={{ ...noteStyle, marginBottom: '1rem' }}>
          {provider === 'resend' ? (
            <>Best for emails to people who have opted in: customers, newsletter subscribers, leads who asked to hear from you. Resend does not allow cold outreach, and can close accounts that send it.</>
          ) : (
            <>Use this for one-to-one sales outreach from your own mailbox: Google Workspace, Microsoft 365, Zoho, or any provider that gives you SMTP details. Gmail and Microsoft accounts need an app password, not your normal password.</>
          )}
        </div>

        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Label (e.g. Raptor outreach)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={fieldInputStyle} placeholder="From email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          <input style={fieldInputStyle} placeholder="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />

          {provider === 'resend' ? (
            <>
              <input style={fieldInputStyle} placeholder="Resend API Key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              <select style={fieldInputStyle} value={plan} onChange={(e) => setPlan(e.target.value as ResendPlan)} aria-label="Resend plan">
                <option value="free">Resend Free plan (100 emails a day, 3,000 a month)</option>
                <option value="paid">Resend paid plan</option>
              </select>
            </>
          ) : (
            <>
              <input style={fieldInputStyle} placeholder="Mail server (e.g. smtp.gmail.com)" value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); setTestOk(false); }} />
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <select style={{ ...fieldInputStyle, flex: 2 }} value={smtpSecurity} onChange={(e) => changeSecurity(e.target.value as Security)} aria-label="Connection type">
                  <option value="starttls">STARTTLS (usually port 587)</option>
                  <option value="ssl">SSL/TLS (usually port 465)</option>
                </select>
                <input style={{ ...fieldInputStyle, flex: 1 }} placeholder="Port" inputMode="numeric" value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); setTestOk(false); }} aria-label="Port" />
              </div>
              <input style={fieldInputStyle} placeholder="Username (leave blank to use your From email)" value={smtpUser} onChange={(e) => { setSmtpUser(e.target.value); setTestOk(false); }} />
              <input style={fieldInputStyle} placeholder="Password or app password" type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestOk(false); }} />
              <button type="button" style={{ ...primaryBtnStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)' }} disabled={testing} onClick={handleTest}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {testOk && <div style={{ color: 'var(--green, #22c55e)', fontSize: '0.65rem' }}>Connected. Nothing was sent. You can save it now.</div>}
            </>
          )}

          <div style={noteStyle}>{rampSummary(provider, plan)} The ramp protects your sender reputation.</div>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>

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
                    {a.provider === 'smtp' ? `SMTP · ${a.smtp_config?.host ?? ''}` : 'Resend'}
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
