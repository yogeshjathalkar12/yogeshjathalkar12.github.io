import { useEffect, useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, ghostBtnStyle } from '../crm/Modal';
import { type OrgMember, transferOwnership } from '../../lib/team';
import OtpGateModal from './OtpGateModal';

interface TransferOwnershipModalProps {
  open: boolean;
  members: OrgMember[];
  onClose: () => void;
  onDone: () => void;
}

// The most powerful action in the product: the person you pick becomes the
// owner (billing, bulk export, two-step policy, transfers), and you become an
// admin so you keep working. Needs the emailed code, then a typed
// confirmation of who is receiving it.
export default function TransferOwnershipModal({ open, members, onClose, onDone }: TransferOwnershipModalProps) {
  const [target, setTarget] = useState('');
  const [typed, setTyped] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const candidates = members.filter((m) => m.status === 'active' && !m.is_owner);
  const chosen = candidates.find((m) => m.user_id === target);

  useEffect(() => {
    if (open) { setTarget(candidates[0]?.user_id || ''); setTyped(''); setError(null); setDone(null); setNeedCode(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function doTransfer() {
    setSaving(true);
    setError(null);
    try {
      await transferOwnership(target);
      setDone(chosen?.email || 'the new owner');
      onDone();
    } catch (err: any) {
      setError(err.message || 'Could not transfer ownership.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal open={open && !needCode} onClose={onClose} title="Transfer ownership" width={460}>
        {done ? (
          <>
            <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginBottom: '0.8rem' }}>{done} is now the owner.</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem', lineHeight: 1.6 }}>
              You&rsquo;re now an admin, so you keep running the team. The organization&rsquo;s plan and credits moved with it.
            </div>
            <button type="button" style={ghostBtnStyle} onClick={onClose}>Close</button>
          </>
        ) : candidates.length === 0 ? (
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 }}>
            Ownership can only go to someone who has joined your team. Invite them first and wait until they accept.
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.62rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6 }}>
              The new owner controls billing, bulk export, the two-step sign-in policy and who can be an admin. You become an admin. Nothing is deleted or moved.
            </div>
            <label style={fieldLabelStyle}>New owner</label>
            <select style={fieldInputStyle} value={target} onChange={(e) => setTarget(e.target.value)}>
              {candidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
            </select>
            <label style={fieldLabelStyle}>Type their email to confirm</label>
            <input style={fieldInputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={chosen?.email || ''} autoComplete="off" />
            {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.7rem' }}>
              <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
              <button
                type="button"
                style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }}
                disabled={saving || !chosen || typed.trim().toLowerCase() !== (chosen.email || '').toLowerCase()}
                onClick={() => setNeedCode(true)}
              >
                {saving ? 'Transferring…' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </Modal>
      <OtpGateModal open={open && needCode} purpose="transfer" onClose={() => setNeedCode(false)} onVerified={() => { setNeedCode(false); doTransfer(); }} />
    </>
  );
}
