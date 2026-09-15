import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { HistoryTable } from '../../components/HistoryTable';
import Modal from '../../components/crm/Modal';

interface CompetitorRow {
  id: string;
  name: string;
  url: string;
  what_they_sell: string;
  target_customer: string;
  pricing_model: string;
  strengths: string[] | null;
  weaknesses: string[] | null;
  positioning: string;
  how_to_beat_them: string[] | null;
  updated_at: string;
}

function ChipList({ items }: { items: string[] | null }) {
  if (!items || items.length === 0) return <span style={{ color: 'var(--dim2)' }}>—</span>;
  return (
    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '0.75rem', marginBottom: '0.3rem', color: 'var(--white)' }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function SyncCompetitors() {
  const [rows, setRows] = useState<CompetitorRow[] | null>(null);
  const [active, setActive] = useState<CompetitorRow | null>(null);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel('sync-competitors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competitors' }, fetchRows)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchRows() {
    const { data, error } = await supabase
      .from('competitors')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load competitors:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  return (
    <div className="arsenal-card">
      <div className="arsenal-card-header">
        <span className="arsenal-card-title">Competitor Battlecards</span>
      </div>
      <div className="arsenal-card-body">
        <HistoryTable<CompetitorRow>
          rows={rows}
          keyField={(r) => r.id}
          emptyText="No competitor battlecards synced from the desktop app yet."
          columns={[
            {
              header: 'Name',
              render: (r) => (
                <button
                  onClick={() => setActive(r)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--purple)',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  {r.name}
                </button>
              ),
            },
            { header: 'What They Sell', render: (r) => r.what_they_sell || '—' },
            { header: 'Pricing Model', render: (r) => r.pricing_model || '—' },
            { header: 'Strengths', render: (r) => (r.strengths || []).length },
            { header: 'Weaknesses', render: (r) => (r.weaknesses || []).length },
          ]}
        />
      </div>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name || 'Competitor'} width={600}>
        {active && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {active.url && (
              <a href={active.url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)', fontSize: '0.7rem' }}>
                {active.url}
              </a>
            )}
            <div>
              <div
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--dim)',
                  marginBottom: '0.4rem',
                }}
              >
                Positioning
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{active.positioning || '—'}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--dim)',
                  marginBottom: '0.4rem',
                }}
              >
                Strengths
              </div>
              <ChipList items={active.strengths} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--dim)',
                  marginBottom: '0.4rem',
                }}
              >
                Weaknesses
              </div>
              <ChipList items={active.weaknesses} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--dim)',
                  marginBottom: '0.4rem',
                }}
              >
                How to Beat Them
              </div>
              <ChipList items={active.how_to_beat_them} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
