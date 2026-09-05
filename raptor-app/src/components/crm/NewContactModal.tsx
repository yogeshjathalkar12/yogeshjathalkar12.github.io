import { useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { findOrCreateCompany, findOrCreateContact } from '../../lib/crmContacts';

const STATUS_OPTIONS = ['cold', 'active', 'hot'];

interface NewContactModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewContactModal({ open, onClose, onCreated }: NewContactModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [status, setStatus] = useState('cold');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedExisting, setMatchedExisting] = useState<any | null>(null);

  function reset() {
    setName(''); setEmail(''); setPhone(''); setCompanyName(''); setStatus('cold');
    setError(null); setMatchedExisting(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const companyId = await findOrCreateCompany(companyName);
      const { contact, created } = await findOrCreateContact({ name, email, phone, companyId, status });

      onCreated();

      if (created) {
        reset();
        onClose();
      } else {
        // Don't silently create a duplicate — tell the user we found (and,
        // if anything was missing, updated) their existing record instead.
        setMatchedExisting(contact);
      }
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      setError(err.message || 'Could not save the contact.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={matchedExisting ? 'Already on File' : 'New Contact'}>
      {matchedExisting ? (
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
            <strong style={{ color: 'var(--white)' }}>{matchedExisting.name}</strong> already exists as a
            contact — we linked to that record instead of creating a duplicate.
          </div>
          <button type="button" style={primaryBtnStyle} onClick={handleClose}>Got it</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={fieldLabelStyle}>Name</label>
          <input style={fieldInputStyle} value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Jane Doe" />

          <label style={fieldLabelStyle}>Email</label>
          <input style={fieldInputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />

          <label style={fieldLabelStyle}>Phone</label>
          <input style={fieldInputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />

          <label style={fieldLabelStyle}>Company</label>
          <input style={fieldInputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Corp" />

          <label style={fieldLabelStyle}>Status</label>
          <select style={fieldInputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={handleClose} disabled={saving}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save Contact'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}