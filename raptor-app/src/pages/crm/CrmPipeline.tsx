import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import BulkImportModal from '../../components/crm/BulkImportModal';
import ExportButton from '../../components/crm/ExportButton';
import { DEALS_IMPORT_SCHEMA } from '../../lib/importSchema';

const STAGES = [
  { key: 'lead', label: 'New Lead' },
  { key: 'meeting', label: 'Meeting Booked' },
  { key: 'negotiation', label: 'Negotiating' },
  { key: 'won', label: 'Won' },
];

export default function CrmPipeline() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  // Initial load and Realtime Subscription
  useEffect(() => {
    fetchDeals();

    // Replicate the realtime listener from crm.html
    const channel = supabase.channel('crm-deals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchDeals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchDeals() {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*, contacts(id, name), companies(id, name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals(data || []);
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    const dealToUpdate = deals.find(d => d.id === dealId);

    if (!dealToUpdate || dealToUpdate.stage === newStage) return;

    // 1. Optimistic UI update (feels instant to the user)
    const previousDeals = [...deals];
    setDeals(deals.map(deal =>
      deal.id === dealId ? { ...deal, stage: newStage } : deal
    ));

    // 2. Exact backend update from crm.html logic
    try {
      const payload: any = { stage: newStage, updated_at: new Date().toISOString() };
      if (newStage === 'won' || newStage === 'lost') {
        payload.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', dealId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to move deal:', error);
      // Revert if the server fails
      setDeals(previousDeals);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Syncing pipeline...</div>;
  }

  // Flattened rows for export — deals carries nested companies/contacts objects,
  // ExportButton needs plain key/value pairs.
  const exportRows = deals.map((d) => ({
    title: d.title,
    value: d.value,
    stage: d.stage,
    company: d.companies?.name || '',
    contact: d.contacts?.name || '',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBottom: '1rem', flexShrink: 0 }}>
        <ExportButton
          data={exportRows}
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'value', label: 'Value' },
            { key: 'stage', label: 'Stage' },
            { key: 'company', label: 'Company' },
            { key: 'contact', label: 'Contact' },
          ]}
          filename="deals"
        />
        <button
          onClick={() => setShowImport(true)}
          style={{
            background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Bulk Import
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.4rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, minHeight: 0 }}>
        {STAGES.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage.key);
          const stageValue = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

          return (
            <div
              key={stage.key}
              onDrop={(e) => handleDrop(e, stage.key)}
              onDragOver={handleDragOver}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                minWidth: '280px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '6px'
              }}
            >
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--white)' }}>
                  {stage.label}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--dim)', background: 'var(--surface)', padding: '0.2rem 0.5rem', border: '1px solid var(--border)' }}>
                  {stageDeals.length} · ${stageValue.toLocaleString()}
                </span>
              </div>

              <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {stageDeals.length === 0 ? (
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1rem 0' }}>No deals here</div>
                ) : (
                  stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '1.1rem',
                        cursor: 'grab',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', color: deal.stage === 'won' ? 'var(--green)' : 'inherit' }}>
                        ${(Number(deal.value) || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--white)', margin: '0.3rem 0' }}>{deal.title}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.5rem' }}>{deal.companies?.name || '—'}</div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>{deal.contacts?.name || 'No contact'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BulkImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        tableName="deals"
        schema={DEALS_IMPORT_SCHEMA}
        onImported={fetchDeals}
      />
    </div>
  );
}