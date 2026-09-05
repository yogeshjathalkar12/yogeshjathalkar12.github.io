import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, primaryBtnStyle } from './Modal';

interface NewTicketModalProps {
  open: boolean;
  contacts: any[];
  onClose: () => void;
  onCreated: () => void;
}

export default function NewTicketModal({ open, contacts, onClose, onCreated }: NewTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('general');
  const [contactId, setContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const { error: insertErr } = await supabase.from('tickets').insert({
        title: title.trim(),
        description: description.trim(),
        priority,
        category,
        contact_id: contactId || null,
        status: 'open',
      });

      if (insertErr) throw insertErr;

      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('general');
      setContactId('');
      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create ticket:', err);
      setError(err.message || 'Could not create ticket.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Support Ticket" width={500}>
      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Subject / Title *
        </label>
        <input
          style={fieldInputStyle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Cannot access dashboard login"
          required
        />

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
              Priority
            </label>
            <select style={fieldInputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
              Category
            </label>
            <select style={fieldInputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="general">General</option>
              <option value="bug">Bug Report</option>
              <option value="billing">Billing Issue</option>
              <option value="feature_request">Feature Request</option>
            </select>
          </div>
        </div>

        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Associated Contact
        </label>
        <select style={fieldInputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">None / Unassigned</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.companies?.name ? `(${c.companies.name})` : ''}
            </option>
          ))}
        </select>

        <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
          Description / Issue Details
        </label>
        <textarea
          style={{ ...fieldInputStyle, height: 90, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the customer's issue..."
        />

        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}
          >
            Cancel
          </button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Saving…' : 'Create Ticket'}
          </button>
        </div>
      </form>
    </Modal>
  );
}