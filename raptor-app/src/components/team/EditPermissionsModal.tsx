import { useEffect, useState } from 'react';
import Modal, { primaryBtnStyle, ghostBtnStyle } from '../crm/Modal';
import PermissionEditor, { type PermissionMap } from './PermissionEditor';
import { type OrgMember, updateMemberPermissions } from '../../lib/team';

interface EditPermissionsModalProps {
  member: OrgMember | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditPermissionsModal({ member, onClose, onSaved }: EditPermissionsModalProps) {
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [preset, setPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) { setPermissions(member.permissions || {}); setPreset(member.preset); setError(null); }
  }, [member]);

  if (!member) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateMemberPermissions(member!.id, permissions, preset);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save those permissions.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!member} onClose={onClose} title="Edit permissions" width={460}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>{member.email}</div>
      <PermissionEditor permissions={permissions} preset={preset} onChange={(p, name) => { setPermissions(p); setPreset(name); }} />
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', margin: '1rem 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.2rem' }}>
        <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" style={primaryBtnStyle} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}
