import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';

const WHATSAPP_API = toolApiBase('whatsapp');

export default function WaConnectionSetup() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .select('id, label, phone_number_id, daily_cap, warmup_target, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to load WhatsApp accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !phoneNumberId.trim() || !wabaId.trim() || !accessToken.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');

      const resp = await fetch(`${WHATSAPP_API}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          label: label.trim(),
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim(),
          access_token: accessToken.trim(),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Could not save this account (${resp.status}).`);
      }

      setLabel('');
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || 'Could not save this account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this WhatsApp account? Its broadcasts, sequences, and contacts stay but stop sending.')) return;
    await supabase.from('whatsapp_accounts').delete().eq('id', id);
    fetchAccounts();
  }

  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        Connect your own Meta WhatsApp Cloud API app — phone_number_id, WABA ID, and access token from your own Meta Business Manager. Your token is encrypted before it's stored. No shared number, no shared reputation.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>Connect a WhatsApp number</div>
        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Label (e.g. Raptor outreach)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Phone Number ID" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
          <input style={fieldInputStyle} placeholder="WhatsApp Business Account ID" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Access Token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
        Connected Numbers
      </div>
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No numbers connected yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{a.label}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>cap {a.daily_cap}/day, ramping to {a.warmup_target}</div>
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
