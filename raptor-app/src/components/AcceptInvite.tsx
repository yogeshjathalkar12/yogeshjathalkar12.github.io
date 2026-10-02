import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useOrg } from '../hooks/OrgContext';
import { fieldLabelStyle, fieldInputStyle, primaryBtnStyle } from './crm/Modal';

// Shown to an invited member the first time they arrive from the email link:
// the invite already signed them in, but the account has no password yet.
// Setting one and calling accept_invite() flips their membership to active.
export default function AcceptInvite() {
  const { refresh } = useOrg();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;
      const { error: acceptErr } = await supabase.rpc('accept_invite');
      if (acceptErr) throw acceptErr;
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Could not finish setting up your account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.5rem' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2rem', maxWidth: 400, width: '100%' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.03em', marginBottom: '0.4rem' }}>Welcome to Raptor</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
          You&rsquo;ve been invited to join a team. Choose a password to finish setting up your account.
        </div>
        <label style={fieldLabelStyle}>Password</label>
        <input style={fieldInputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <label style={fieldLabelStyle}>Confirm password</label>
        <input style={fieldInputStyle} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <button type="submit" style={{ ...primaryBtnStyle, width: '100%' }} disabled={saving}>{saving ? 'Saving…' : 'Join the team'}</button>
      </form>
    </div>
  );
}
