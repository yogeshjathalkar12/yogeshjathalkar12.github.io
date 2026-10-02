import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useOrg } from '../hooks/OrgContext';
import { primaryBtnStyle } from './crm/Modal';

// Shown to an invited member who signed in some way OTHER than the invitation
// email link (arriving from that link accepts automatically - see OrgGate).
// One button, no password: joining is just a confirmation, so nobody is
// silently added to a team they never saw an invitation to.
export default function AcceptInvite() {
  const { refresh } = useOrg();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setSaving(true);
    setError(null);
    try {
      const { error: acceptErr } = await supabase.rpc('accept_invite');
      if (acceptErr) throw acceptErr;
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Could not join the team.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2rem', maxWidth: 400, width: '100%' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.03em', marginBottom: '0.4rem' }}>Join the team</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', lineHeight: 1.6 }}>
          You&rsquo;ve been invited to join a team on Raptor. Joining gives you access to the records and tools your team owner has chosen for you.
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <button type="button" style={{ ...primaryBtnStyle, width: '100%' }} onClick={handleJoin} disabled={saving}>
          {saving ? 'Joining…' : 'Join the team'}
        </button>
      </div>
    </div>
  );
}
