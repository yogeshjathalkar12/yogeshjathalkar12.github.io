import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';

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

  function reset() {
    setName(''); setEmail(''); setPhone(''); setCompanyName(''); setStatus('cold');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let companyId: string | null = null;
      if (companyName.trim()) {
        const { data: existingCompany } = await supabase
          .from('companies')
          .select('id')
          .ilike('name', companyName.trim())
          .maybeSingle();

        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          const { data: newCompany, error: companyErr } = await supabase
            .from('companies')
            .insert({ name: companyName.trim() })
            .select('id')
            .single();
          if (companyErr) throw companyErr;
          companyId = newCompany.id;
        }
      }

      const { error: contactErr } = await supabase.from('contacts').insert({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company_id: companyId,
        status,
      });
      if (contactErr) throw contactErr;

      reset();
      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      setError(err.message || 'Could not save the contact.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Contact">
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
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save Contact'}</button>
        </div>
      </form>
    </Modal>
  );
}