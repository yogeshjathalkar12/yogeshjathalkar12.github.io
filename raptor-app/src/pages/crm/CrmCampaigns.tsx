import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/crmHelpers';
import CampaignModal from '../../components/crm/CampaignModal';
import RowMenu from '../../components/crm/RowMenu';

export default function CrmCampaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-campaigns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const [campaignsRes, dealsRes] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('deals').select('id, campaign_id, stage, value'),
      ]);
      if (campaignsRes.error) throw campaignsRes.error;
      if (dealsRes.error) throw dealsRes.error;
      setCampaigns(campaignsRes.data || []);
      setDeals(dealsRes.data || []);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(c: any) {
    setEditing(c);
    setModalOpen(true);
  }

  async function handleDelete(c: any) {
    if (!confirm(`Delete "${c.name}"? Deals tagged to it stay — they just become untagged.`)) return;
    try {
      const { error } = await supabase.from('campaigns').delete().eq('id', c.id);
      if (error) throw error;
      fetchAll();
    } catch (error: any) {
      console.error('Failed to delete campaign:', error);
      alert(error.message || 'Could not delete this campaign.');
    }
  }

  function campaignStats(campaignId: string) {
    const campaignDeals = deals.filter((d) => d.campaign_id === campaignId);
    const won = campaignDeals.filter((d) => d.stage === 'won');
    const wonValue = won.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    return { totalDeals: campaignDeals.length, wonCount: won.length, wonValue };
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading campaigns…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
          Group deals under a shared push and track progress against a target.
        </div>
        <button
          onClick={openNew}
          style={{
            background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
          }}
        >
          + New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          padding: '3rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.7rem',
        }}>
          No campaigns yet. Create one to start tracking sales toward a target.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
          {campaigns.map((c) => {
            const { totalDeals, wonCount, wonValue } = campaignStats(c.id);
            const target = Number(c.target_count) || 0;
            const pct = target > 0 ? Math.min(100, (wonCount / target) * 100) : 0;
            return (
              <div
                key={c.id}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.2rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                  <div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem' }}>{c.name}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                      {c.product_name || 'No product set'}
                      {c.product_price ? ` · ${formatCurrency(c.product_price)}` : ''}
                    </div>
                  </div>
                  <RowMenu
                    actions={[
                      { label: 'Edit', onClick: () => openEdit(c) },
                      { label: 'Delete', onClick: () => handleDelete(c), danger: true },
                    ]}
                  />
                </div>

                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '0.35rem' }}>
                  {wonCount} / {target || '—'} sold
                  {totalDeals > wonCount && <span> · {totalDeals - wonCount} in progress</span>}
                </div>
                <div style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 999, height: 8, overflow: 'hidden', marginBottom: '0.7rem',
                }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--grad)' }} />
                </div>

                <div style={{ fontSize: '0.6rem', color: 'var(--dim2)' }}>
                  {formatCurrency(wonValue)} won
                  {(c.start_date || c.end_date) && (
                    <span> · {c.start_date || '—'} → {c.end_date || '—'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CampaignModal open={modalOpen} campaign={editing} onClose={() => setModalOpen(false)} onSaved={fetchAll} />
    </div>
  );
}