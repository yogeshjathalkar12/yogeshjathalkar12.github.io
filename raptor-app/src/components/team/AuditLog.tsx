import { useEffect, useState } from 'react';
import { type AuditEntry, loadAuditLog } from '../../lib/team';

const LABELS: Record<string, string> = {
  member_invited: 'Invited a member',
  invite_resent: 'Resent an invitation',
  member_removed: 'Removed a member',
  export: 'Exported data',
  import: 'Imported data',
  otp_sent: 'Requested an export code',
  otp_verified: 'Verified an export code',
  otp_failed: 'Entered a wrong export code',
};

function describe(entry: AuditEntry): string {
  const d = entry.detail || {};
  if (d.email) return d.email;
  if (entry.action === 'export' || entry.action === 'import') return `${d.filename || d.table || ''} ${d.rows != null ? `(${d.rows} rows)` : ''}`.trim();
  return '';
}

export default function AuditLog({ emailsByUserId }: { emailsByUserId: Record<string, string> }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLog().then(setEntries).catch((e) => setError(e.message || 'Could not load the audit log.'));
  }, []);

  if (error) return <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>;
  if (!entries) return <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Loading…</div>;
  if (entries.length === 0) return <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Nothing recorded yet.</div>;

  return (
    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: '0 0.8rem' }}>
      {entries.map((e) => (
        <div key={e.id} style={{ display: 'flex', gap: '0.8rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.62rem' }}>
          <span style={{ color: 'var(--dim2)', flex: '0 0 120px' }}>{new Date(e.created_at).toLocaleString()}</span>
          <span style={{ color: 'var(--white)', flex: 1 }}>
            {LABELS[e.action] || e.action} <span style={{ color: 'var(--dim)' }}>{describe(e)}</span>
          </span>
          <span style={{ color: 'var(--dim)' }}>{e.actor_id ? emailsByUserId[e.actor_id] || '' : ''}</span>
        </div>
      ))}
    </div>
  );
}
