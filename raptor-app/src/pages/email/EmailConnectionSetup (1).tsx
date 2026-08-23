import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';

const EMAIL_API = toolApiBase('email');

const EMAIL_BACKEND_URL = import.meta.env.VITE_EMAIL_BACKEND_URL;

export default function EmailConnectionSetup() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      // Still read directly via Supabase — RLS already scopes this to the
      // caller's own rows, and encrypted_api_key never gets selected here
      // anyway (only used server-side, in sender.py).
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, label, provider, from_email, from_name, daily_cap, warmup_target, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to load email accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !fromEmail.trim() || !fromName.trim() || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Creation now goes through the backend, not a direct insert — the
      // API key needs to be encrypted server-side (email_key_vault.py)
      // before it ever reaches Postgres. The frontend never holds the
      // encryption key, so it can't do this itself.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');

      const resp = await fetch(`${EMAIL_API}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          label: label.trim(),
          provider: 'resend',
          from_email: fromEmail.trim(),
          from_name: fromName.trim(),
          api_key: apiKey.trim(),
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
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        Connect your own sending account (Resend to start). Nothing routes through a shared identity — every send uses your own credentials, warm-up ramp, and suppression list. Your API key is encrypted before it's stored.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>Connect a sending account</div>
        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Label (e.g. Raptor outreach)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={fieldInputStyle} placeholder="From email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          <input style={fieldInputStyle} placeholder="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Resend API Key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
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
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{a.label}</div>
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
