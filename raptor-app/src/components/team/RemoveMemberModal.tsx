import { useEffect, useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, ghostBtnStyle } from '../crm/Modal';
import { type OrgMember, removeMember } from '../../lib/team';

interface RemoveMemberModalProps {
  member: OrgMember | null;
  members: OrgMember[];
  onClose: () => void;
  onRemoved: () => void;
}

// Offboarding: access ends immediately and the member can never sign in
// again, but nothing they created is deleted - their contacts and deals
// move to someone you choose.
export default function RemoveMemberModal({ member, members, onClose, onRemoved }: RemoveMemberModalProps) {
  const [reassignTo, setReassignTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reassigned: Record<string, number>; warnings: string[] } | null>(null);

  const candidates = members.filter((m) => m.status === 'active' && m.user_id !== member?.user_id);

  useEffect(() => {
    if (member) {
      setError(null);
      setResult(null);
      const owner = members.find((m) => m.is_owner && m.status === 'active');
      setReassignTo(owner?.user_id || candidates[0]?.user_id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  if (!member) return null;

  async function handleRemove() {
    if (!reassignTo) { setError('Choose who should receive their records.'); return; }
    setSaving(true);
    setError(null);
    try {
      setResult(await removeMember(member!.user_id, reassignTo));
      onRemoved();
    } catch (err: any) {
      setError(err.message || 'Could not remove this member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!member} onClose={onClose} title="Remove team member" width={460}>
      {result ? (
        <>
          <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginBottom: '0.8rem' }}>
            {member.email} no longer has access.
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
            Moved: {result.reassigned?.contacts ?? 0} contact(s), {result.reassigned?.deals ?? 0} deal(s). Automations they created were switched off.
          </div>
          {result.warnings?.length > 0 && (
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1rem' }}>Note: {result.warnings.join('; ')}.</div>
          )}
          <button type="button" style={ghostBtnStyle} onClick={onClose}>Close</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '0.6rem' }}>{member.email}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6 }}>
            They lose access immediately and are signed out everywhere. Nothing is deleted &mdash; the history stays on record.
          </div>
          <label style={fieldLabelStyle}>Reassign their contacts and deals to</label>
          <select style={fieldInputStyle} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            {candidates.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.email}{m.is_owner ? ' (owner)' : ''}</option>
            ))}
          </select>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
            <button
              type="button"
              style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }}
              onClick={handleRemove}
              disabled={saving}
            >
              {saving ? 'Removing…' : 'Remove access'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
