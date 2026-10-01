import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { findOrCreateCompany, findOrCreateContact } from '../../lib/crmContacts';
import { type PipelineStage, loadPipelineStages } from '../../lib/pipelineStages';

interface NewDealModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewDealModal({ open, onClose, onCreated }: NewDealModalProps) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchCampaigns();
      loadPipelineStages().then((rows) => {
        setStages(rows);
        setStage((prev) => prev || rows[0]?.key || '');
      }).catch((err) => console.error('Failed to load pipeline stages:', err));
    }
  }, [open]);

  async function fetchCampaigns() {
    try {
      const { data, error } = await supabase.from('campaigns').select('id, name').order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  }

  function reset() {
    setTitle(''); setValue(''); setStage(stages[0]?.key || '');
    setCompanyName(''); setContactName(''); setContactEmail(''); setCampaignId('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Both of these now go through the same identity resolution NewContactModal
      // uses — same person, same company, no matter which form they were typed into.
      const companyId = await findOrCreateCompany(companyName);

      let contactId: string | null = null;
      if (contactName.trim()) {
        const { contact } = await findOrCreateContact({
          name: contactName,
          email: contactEmail,
          companyId,
          status: 'active',
        });
        contactId = contact.id;
      }

      const { error: dealErr } = await supabase.from('deals').insert({
        title: title.trim(),
        value: Number(value) || 0,
        stage,
        company_id: companyId,
        contact_id: contactId,
        campaign_id: campaignId || null,
      });
      if (dealErr) throw dealErr;

      reset();
      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create deal:', err);
      setError(err.message || 'Could not create the deal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { onClose(); }} title="New Deal">
      <form onSubmit={handleSubmit}>
        <label style={fieldLabelStyle}>Deal Title</label>
        <input style={fieldInputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Website revamp" />

        <label style={fieldLabelStyle}>Value (USD)</label>
        <input style={fieldInputStyle} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} required placeholder="0" />

        <label style={fieldLabelStyle}>Stage</label>
        <select style={fieldInputStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
          {stages.map((s) => (
            <option key={s.id} value={s.key}>{s.label}</option>
          ))}
        </select>

        <label style={fieldLabelStyle}>Campaign</label>
        <select style={fieldInputStyle} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">No campaign</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label style={fieldLabelStyle}>Company</label>
        <input style={fieldInputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Corp" />

        <label style={fieldLabelStyle}>Contact Name</label>
        <input style={fieldInputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Jane Doe" />

        <label style={fieldLabelStyle}>Contact Email</label>
        <input style={fieldInputStyle} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="jane@acme.com" />

        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Creating…' : 'Create Deal'}</button>
        </div>
      </form>
    </Modal>
  );
}