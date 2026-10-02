import { useEffect, useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../crm/Modal';
import PermissionEditor, { type PermissionMap } from './PermissionEditor';
import { PRESETS, inviteMember } from '../../lib/team';

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

const REP = PRESETS.find((p) => p.name === 'Rep')!;
const repPermissions = (): PermissionMap => Object.fromEntries(REP.permissions.map((k) => [k, true]));

export default function InviteMemberModal({ open, onClose, onInvited }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<PermissionMap>(repPermissions());
  const [preset, setPreset] = useState<string | null>('Rep');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setEmail(''); setPermissions(repPermissions()); setPreset('Rep'); setError(null); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await inviteMember(email.trim(), permissions, preset);
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not send the invitation.');
      onInvited(); // the member row may exist even if the email failed
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite a team member" width={460}>
      <form onSubmit={handleSubmit}>
        <label style={fieldLabelStyle}>Work email</label>
        <input style={fieldInputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" required />
        <PermissionEditor permissions={permissions} preset={preset} onChange={(p, name) => { setPermissions(p); setPreset(name); }} />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', margin: '1rem 0' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.2rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Sending…' : 'Send invitation'}</button>
        </div>
      </form>
    </Modal>
  );
}
