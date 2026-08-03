import { useState } from 'react';

const STAGES = [
  { key: 'lead', label: 'New Lead' },
  { key: 'meeting', label: 'Meeting Booked' },
  { key: 'negotiation', label: 'Negotiating' },
  { key: 'won', label: 'Won' },
];

export default function CrmPipeline() {
  // Placeholder state - ready to be replaced by a Supabase fetch
  const [deals, setDeals] = useState([
    { id: '1', title: 'Defense R&D Proposal', company: 'Construct Robotics', value: 45000, stage: 'negotiation' },
    { id: '2', title: 'Q3 Enterprise License', company: 'Astra-Q Systems', value: 12500, stage: 'lead' },
    { id: '3', title: 'Security Audit', company: 'Global Logistics', value: 89000, stage: 'meeting' },
  ]);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
  };

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    
    // Update local state (later, you will add the Supabase update call here)
    setDeals(deals.map(deal => 
      deal.id === dealId ? { ...deal, stage: stageKey } : deal
    ));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Required to allow dropping
  };

  return (
    <div style={{ display: 'flex', gap: '1.4rem', overflowX: 'auto', paddingBottom: '1rem', height: '100%' }}>
      {STAGES.map(stage => {
        const stageDeals = deals.filter(d => d.stage === stage.key);
        const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);

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
              {stageDeals.map(deal => (
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
                    ${deal.value.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--white)', margin: '0.3rem 0' }}>{deal.title}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{deal.company}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}