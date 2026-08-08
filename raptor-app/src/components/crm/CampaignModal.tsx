import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';

interface CampaignModalProps {
  open: boolean;
  campaign: any | null; // null = creating, otherwise editing
  onClose: () => void;
  onSaved: () => void;
}

export default function CampaignModal({ open, campaign, onClose, onSaved }: CampaignModalProps) {
  const [name, setName] = useState('');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (campaign) {
        setName(campaign.name || '');
        setProductName(campaign.product_name || '');
        setProductPrice(campaign.product_price != null ? String(campaign.product_price) : '');
        setTargetCount(campaign.target_count != null ? String(campaign.target_count) : '');
        setStartDate(campaign.start_date || '');
        setEndDate(campaign.end_date || '');
      } else {
        setName('');
        setProductName('');
        setProductPrice('');
        setTargetCount('');
        setStartDate('');
        setEndDate('');
      }
      setError(null);
    }
  }, [open, campaign]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        product_name: productName.trim() || null,
        product_price: productPrice ? Number(productPrice) : 0,
        target_count: targetCount ? Number(targetCount) : 0,
        start_date: startDate || null,
        end_date: endDate || null,
      };

      if (campaign?.id) {
        const { error: updateErr } = await supabase.from('campaigns').update(payload).eq('id', campaign.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('campaigns').insert(payload);
        if (insertErr) throw insertErr;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save campaign:', err);
      setError(err.message || 'Could not save this campaign.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={campaign ? 'Edit Campaign' : 'New Campaign'}>
      <form onSubmit={handleSubmit}>
        <label style={fieldLabelStyle}>Campaign Name</label>
        <input
          style={fieldInputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Product A Launch"
        />

        <label style={fieldLabelStyle}>Product</label>
        <input
          style={fieldInputStyle}
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. Product A"
        />

        <label style={fieldLabelStyle}>Price (USD)</label>
        <input
          style={fieldInputStyle}
          type="number"
          min="0"
          value={productPrice}
          onChange={(e) => setProductPrice(e.target.value)}
          placeholder="0"
        />

        <label style={fieldLabelStyle}>Target — units to sell</label>
        <input
          style={fieldInputStyle}
          type="number"
          min="0"
          value={targetCount}
          onChange={(e) => setTargetCount(e.target.value)}
          placeholder="e.g. 1000"
        />

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>Start Date</label>
            <input style={fieldInputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>End Date</label>
            <input style={fieldInputStyle} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Saving…' : campaign ? 'Save Changes' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </Modal>
  );
}