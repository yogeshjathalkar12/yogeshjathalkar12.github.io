import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { useAuth } from '../../hooks/AuthContext';
import { PERMISSIONS } from '../../lib/team';

// Shown on a team member's dashboard (never the owner's): who they are on
// this team, exactly what they may do, and how much they can see. The counts
// come straight from the database, which already limits them to what the
// member is allowed to read.
export default function MyAccessCard() {
  const { isOwner, status, preset, permissions, can } = useOrg();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<number | null>(null);
  const [deals, setDeals] = useState<number | null>(null);

  // One-time notice: shown the first time, then hidden once dismissed. It
  // comes back only if the owner changes this member's access (the stored
  // fingerprint of preset + permissions no longer matches), and says so.
  const signature = JSON.stringify({ preset, perms: Object.keys(permissions).filter((k) => (permissions as any)[k]).sort() });
  const storageKey = user ? `raptor_access_seen_${user.id}` : null;
  const readSeen = () => { try { return storageKey ? localStorage.getItem(storageKey) : null; } catch { return null; } };
  const [seen, setSeen] = useState<string | null>(readSeen);
  useEffect(() => { setSeen(readSeen()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storageKey]);
  const dismiss = () => {
    try { if (storageKey) localStorage.setItem(storageKey, signature); } catch { /* storage unavailable - it just shows again next visit */ }
    setSeen(signature);
  };

  useEffect(() => {
    if (isOwner || status !== 'active') return;
    supabase.from('contacts').select('id', { count: 'exact', head: true }).then(({ count }) => setContacts(count ?? 0));
    supabase.from('deals').select('id', { count: 'exact', head: true }).then(({ count }) => setDeals(count ?? 0));
  }, [isOwner, status]);

  if (isOwner || status !== 'active' || seen === signature) return null;
  const wasUpdated = seen !== null;

  const sees = can('view_all') ? 'Everyone’s records on the team' : 'Only the records you created or were assigned';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.4rem', marginBottom: '2rem', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'var(--dim2)', textTransform: 'uppercase' }}>
          {wasUpdated ? 'Your access was updated' : 'Your access'}
        </div>
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
      <button
        type="button"
        onClick={dismiss}
        style={{ marginTop: '1rem', padding: '0.5rem 1.1rem', background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        Got it
      </button>
    </div>
  );
}
