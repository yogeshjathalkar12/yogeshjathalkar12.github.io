import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { findOrCreateContact } from '../../lib/crmContacts';

const STAGE_OPTIONS = [
  { key: 'lead', label: 'New Lead' },
  { key: 'meeting', label: 'Meeting Booked' },
  { key: 'negotiation', label: 'Negotiating' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

interface DealDetailModalProps {
  deal: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DealDetailModal({ deal, onClose, onSaved }: DealDetailModalProps) {
  const [value, setValue] = useState('0');
  const [stage, setStage] = useState('lead');
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactId, setContactId] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deal) {
      setValue(String(deal.value ?? 0));
      setStage(deal.stage);
      setCampaignId(deal.campaign_id || '');
      setContactId(deal.contact_id || '');
      setAddingContact(false);
      setNewContactName('');
      setNewContactEmail('');
      setError(null);
      fetchCampaigns();
      fetchContacts();
    }
  }, [deal]);

  async function fetchCampaigns() {
    try {
      const { data, error } = await supabase.from('campaigns').select('id, name').order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  }

  async function fetchContacts() {
    try {
      const { data, error } = await supabase.from('contacts').select('id, name').order('name', { ascending: true });
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }

  if (!deal) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let finalContactId: string | null = contactId || null;

      // Only touches the shared resolver if the user actually typed a new
      // person here — this is what makes "add a contact mid-deal" land in
      // `contacts` instead of only ever living on this one deal row.
      if (addingContact && newContactName.trim()) {
        const { contact } = await findOrCreateContact({
          name: newContactName,
          email: newContactEmail,
          companyId: deal.company_id || null,
          status: 'active',
        });
        finalContactId = contact.id;
      }

      const payload: any = {
        value: Number(value) || 0,
        stage,
        campaign_id: campaignId || null,
        contact_id: finalContactId,
        updated_at: new Date().toISOString(),
      };
      if (stage === 'won' || stage === 'lost') payload.closed_at = new Date().toISOString();
      const { error: updateErr } = await supabase.from('deals').update(payload).eq('id', deal.id);
      if (updateErr) throw updateErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to update deal:', err);
      setError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this deal? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      const { error: deleteErr } = await supabase.from('deals').delete().eq('id', deal.id);
      if (deleteErr) throw deleteErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete deal:', err);
      setError(err.message || 'Could not delete the deal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!deal} onClose={onClose} title={deal.title}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
        {deal.companies?.name || '—'} · {deal.contacts?.name || 'No contact yet'}
      </div>

      <label style={fieldLabelStyle}>Value (USD)</label>
      <input style={fieldInputStyle} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} />

      <label style={fieldLabelStyle}>Stage</label>
      <select style={fieldInputStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
        {STAGE_OPTIONS.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      <label style={fieldLabelStyle}>Campaign</label>
      <select style={fieldInputStyle} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
        <option value="">No campaign</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <label style={fieldLabelStyle}>Contact</label>
      {!addingContact ? (
        <>
          <select style={fieldInputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setAddingContact(true); setContactId(''); }}
            style={{ ...ghostBtnStyle, marginBottom: '1.1rem', padding: '0.5rem 0.8rem' }}
          >
            + New Contact
          </button>
        </>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.9rem', marginBottom: '1.1rem' }}>
          <label style={fieldLabelStyle}>Name</label>
          <input style={fieldInputStyle} value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="e.g. Jane Doe" />
          <label style={fieldLabelStyle}>Email</label>
          <input style={{ ...fieldInputStyle, marginBottom: '0.6rem' }} value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="jane@acme.com" />
          <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.6rem' }}>
            If this person already exists (matched by email or name), we'll link to them instead of creating a duplicate.
          </div>
          <button type="button" style={ghostBtnStyle} onClick={() => setAddingContact(false)}>Cancel</button>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
        <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDelete} disabled={saving}>
          Delete
        </button>
        <button type="button" style={primaryBtnStyle} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}