import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { initials, relativeTime, TYPE_ICON } from '../../lib/crmHelpers';

interface ContactPanelProps {
  contact: any | null;
  interactions: any[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ContactPanel({ contact, interactions, onClose, onChanged }: ContactPanelProps) {
  const [status, setStatus] = useState(contact?.status || 'cold');
  const [activityType, setActivityType] = useState('note');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!contact) return null;

  const contactActivity = interactions.filter((i) => i.contact_id === contact.id);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    try {
      const { error: updateErr } = await supabase.from('contacts').update({ status: newStatus }).eq('id', contact.id);
      if (updateErr) throw updateErr;
      onChanged();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setError(err.message || 'Could not update status.');
    }
  }

  async function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('interactions').insert({
        contact_id: contact.id,
        type: activityType,
        content: content.trim(),
      });
      if (insertErr) throw insertErr;

      await supabase.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contact.id);

      setContent('');
      onChanged();
    } catch (err: any) {
      console.error('Failed to log activity:', err);
      setError(err.message || 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!contact} onClose={onClose} title="" width={480}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--grad)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem', color: '#fff', flexShrink: 0,
        }}>
          {initials(contact.name)}
        </div>
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem' }}>{contact.name}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>{contact.companies?.name || 'No company on file'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.4rem', fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
        <div>{contact.email || '—'}</div>
        <div>{contact.phone || '—'}</div>
      </div>

      <label style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.4rem', display: 'block' }}>
        Status
      </label>
      <select style={fieldInputStyle} value={status} onChange={(e) => handleStatusChange(e.target.value)}>
        <option value="cold">Cold</option>
        <option value="active">Active</option>
        <option value="hot">Hot</option>
      </select>

      <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1rem 0 0.6rem' }}>
        Activity
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '4px', padding: contactActivity.length ? '0.4rem 0.9rem' : 0 }}>
        {contactActivity.length === 0 ? (
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1.2rem 0' }}>
            Nothing logged for this contact yet
          </div>
        ) : (
          contactActivity.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: '0.7rem', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>{TYPE_ICON[i.type] || '•'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)', textTransform: 'uppercase' }}>{i.type}</div>
                <div style={{ fontSize: '0.7rem', margin: '0.2rem 0' }}>{i.content}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>{relativeTime(i.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleLogActivity} style={{ display: 'flex', gap: '0.6rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 120, flexShrink: 0 }} value={activityType} onChange={(e) => setActivityType(e.target.value)}>
          <option value="note">Note</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
        </select>
        <input
          style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
          placeholder="Log an update…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" style={{ ...primaryBtnStyle, flex: '0 0 auto' }} disabled={saving}>
          {saving ? '…' : 'Add'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginTop: '0.8rem' }}>{error}</div>}
    </Modal>
  );
}