import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { PERMISSIONS } from '../../lib/team';

// Shown on a team member's dashboard (never the owner's): who they are on
// this team, exactly what they may do, and how much they can see. The counts
// come straight from the database, which already limits them to what the
// member is allowed to read.
export default function MyAccessCard() {
  const { isOwner, status, preset, permissions, can } = useOrg();
  const [contacts, setContacts] = useState<number | null>(null);
  const [deals, setDeals] = useState<number | null>(null);

  useEffect(() => {
    if (isOwner || status !== 'active') return;
    supabase.from('contacts').select('id', { count: 'exact', head: true }).then(({ count }) => setContacts(count ?? 0));
    supabase.from('deals').select('id', { count: 'exact', head: true }).then(({ count }) => setDeals(count ?? 0));
  }, [isOwner, status]);

  if (isOwner || status !== 'active') return null;

  const sees = can('view_all') ? 'Everyone’s records on the team' : 'Only the records you created or were assigned';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.4rem', marginBottom: '2rem', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'var(--dim2)', textTransform: 'uppercase' }}>Your access</div>
        <span style={{ fontSize: '0.65rem', color: '#fff', background: 'var(--grad)', padding: '0.25rem 0.7rem', borderRadius: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {preset || 'Team member'}
        </span>
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '0.3rem' }}>You can see: <span style={{ color: 'var(--dim)' }}>{sees}</span></div>
      <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '1rem' }}>
        Right now: <span style={{ color: 'var(--dim)' }}>{contacts ?? '…'} contact(s), {deals ?? '…'} deal(s)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem 1.2rem' }}>
        {PERMISSIONS.filter((p) => p.key !== 'view_all').map((p) => (
          <div key={p.key} style={{ fontSize: '0.65rem', color: permissions[p.key] ? 'var(--green)' : 'var(--dim2)' }}>
            {permissions[p.key] ? '✓' : '✕'} {p.label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.58rem', color: 'var(--dim2)', marginTop: '0.9rem' }}>
        Ask your team&rsquo;s owner if you need more access. Importing and exporting data is owner-only.
      </div>
    </div>
  );
}
