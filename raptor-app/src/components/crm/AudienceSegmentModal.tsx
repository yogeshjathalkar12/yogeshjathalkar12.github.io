import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, primaryBtnStyle } from './Modal';

interface AudienceSegmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function AudienceSegmentModal({ open, onClose, onCreated }: AudienceSegmentModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase.from('audience_lists').insert({
        name: name.trim(),
        description: description.trim(),
        filter_rules: {
          status: statusFilter,
          min_score: minScore,
        },
      });

      if (error) throw error;

      setName('');
      setDescription('');
      setStatusFilter('all');
      setMinScore(0);
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create audience list:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Audience Segment" width={480}>
      <form onSubmit={handleCreate}>
        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Segment Name *
        </label>
        <input
          style={fieldInputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hot Leads with Score > 30"
          required
        />

        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Description
        </label>
        <input
          style={fieldInputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Target audience description..."
        />

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
              Contact Status
            </label>
            <select style={fieldInputStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="hot">Hot</option>
              <option value="active">Active</option>
              <option value="cold">Cold</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
              Minimum Lead Score
            </label>
            <input
              type="number"
              style={fieldInputStyle}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}
          >
            Cancel
          </button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Creating…' : 'Save Segment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}