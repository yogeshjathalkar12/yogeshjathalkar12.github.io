import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, primaryBtnStyle } from './Modal';

interface LeadScoringModalProps {
  open: boolean;
  contact: any | null;
  teamMembers?: string[];
  onClose: () => void;
  onUpdated: () => void;
}

const DEFAULT_TEAM = ['Unassigned', 'Yogesh', 'Yadnyesh', 'Sales Bot', 'Support Team'];

export default function LeadScoringModal({
  open,
  contact,
  teamMembers = DEFAULT_TEAM,
  onClose,
  onUpdated,
}: LeadScoringModalProps) {
  const [assignedTo, setAssignedTo] = useState(contact?.assigned_to || 'Unassigned');
  const [manualScoreBonus, setManualScoreBonus] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!contact) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const newScore = (contact.lead_score || 0) + Number(manualScoreBonus);

      const { error } = await supabase
        .from('contacts')
        .update({
          assigned_to: assignedTo,
          lead_score: newScore,
        })
        .eq('id', contact.id);

      if (error) throw error;

      onUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to update lead details:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Lead Assignment: ${contact.name}`} width={440}>
      <form onSubmit={handleSave}>
        <div style={{ marginBottom: '1.2rem', background: 'var(--surface2)', padding: '1rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim)', textTransform: 'uppercase' }}>Current Lead Score</div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2rem', color: 'var(--purple)' }}>
            {contact.lead_score || 0} pts
          </div>
        </div>

        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Assign Owner
        </label>
        <select style={fieldInputStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          {teamMembers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Add Score Adjustment (Bonus / Penalty)
        </label>
        <input
          type="number"
          style={fieldInputStyle}
          value={manualScoreBonus}
          onChange={(e) => setManualScoreBonus(Number(e.target.value))}
          placeholder="e.g. +10 or -5"
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}
          >
            Cancel
          </button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Updating…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}