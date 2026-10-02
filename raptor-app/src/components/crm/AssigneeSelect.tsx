import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory, useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { fieldLabelStyle, fieldInputStyle } from './Modal';

interface AssigneeSelectProps {
  table: 'contacts' | 'deals';
  recordId: string;
  value: string | null;
  onChanged: () => void;
}

// Who a contact/deal is assigned to. Anyone can see it; the dropdown only
// appears when the signed-in person is actually allowed to hand records to
// someone else - the database enforces the same rule (owner and "see
// everyone's records" -> anyone or unassigned; a manager -> themselves and
// their reports; everyone else -> themselves).
export default function AssigneeSelect({ table, recordId, value, onChanged }: AssigneeSelectProps) {
  const { entries } = useDirectory();
  const { isOwner, can } = useOrg();
  const labels = useMemberLabels([value]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUnassign = isOwner || can('view_all');
  const options = entries.filter((e) => e.can_assign);
  const currentLabel = value
    ? shortName(entries.find((e) => e.user_id === value)?.email || labels[value])
    : 'Unassigned';
  const editable = options.some((o) => o.user_id !== value) || (canUnassign && value !== null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    setError(null);
    const { error: updateErr } = await supabase
      .from(table)
      .update({ assignee_id: e.target.value || null })
      .eq('id', recordId);
    setSaving(false);
    if (updateErr) { setError(updateErr.message); return; }
    onChanged();
  }

  return (
    <div style={{ marginTop: '1.2rem' }}>
      <label style={fieldLabelStyle}>Assigned to</label>
      {editable ? (
        <select style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} value={value || ''} onChange={handleChange} disabled={saving}>
          {canUnassign && <option value="">Unassigned</option>}
          {value && !options.some((o) => o.user_id === value) && <option value={value} disabled>{currentLabel}</option>}
          {options.map((o) => (
            <option key={o.user_id} value={o.user_id}>{shortName(o.email)}{o.is_me ? ' (me)' : ''}{o.is_owner ? ' — owner' : ''}</option>
          ))}
        </select>
      ) : (
        <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '0.4rem' }}>{currentLabel}</div>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem' }}>{error}</div>}
    </div>
  );
}
