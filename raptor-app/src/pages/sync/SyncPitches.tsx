import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { HistoryTable } from '../../components/HistoryTable';
import { relativeTime } from '../../lib/crmHelpers';
import Modal from '../../components/crm/Modal';

interface PitchRow {
  id: string;
  contact_id: string;
  channel: string;
  subject: string;
  body: string;
  angle_used: string;
  validation_status: string;
  created_at: string;
  contacts: { id: string; name: string } | null;
}

const VALIDATION_COLORS: Record<string, string> = {
  passed: 'var(--green)',
  failed: 'var(--dim)',
};

export default function SyncPitches() {
  const [rows, setRows] = useState<PitchRow[] | null>(null);
  const [activePitch, setActivePitch] = useState<PitchRow | null>(null);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel('sync-pitches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pitches' }, fetchRows)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchRows() {
    const { data, error } = await supabase
      .from('pitches')
      .select('*, contacts(id, name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load pitches:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  return (
    <div className="arsenal-card">
      <div className="arsenal-card-header">
        <span className="arsenal-card-title">Generated Pitches</span>
      </div>
      <div className="arsenal-card-body">
        <HistoryTable<PitchRow>
          rows={rows}
          keyField={(r) => r.id}
          emptyText="No pitches generated from the desktop app yet."
          columns={[
            {
              header: 'Contact',
              render: (r) => r.contacts?.name || <span style={{ color: 'var(--dim2)' }}>Unknown</span>,
            },
            {
              // Body is often long - shown in a modal on click rather than inline.
              header: 'Subject',
              render: (r) => (
                <button
                  onClick={() => setActivePitch(r)}
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
                  {r.subject || <span style={{ color: 'var(--dim2)' }}>(empty)</span>}
                </button>
              ),
            },
            { header: 'Channel', render: (r) => r.channel },
            {
              header: 'Validation',
              render: (r) => (
                <span style={{ color: VALIDATION_COLORS[r.validation_status] || 'var(--dim)' }}>
                  {r.validation_status}
                </span>
              ),
            },
            { header: 'Generated', render: (r) => relativeTime(r.created_at) },
          ]}
        />
      </div>

      <Modal open={!!activePitch} onClose={() => setActivePitch(null)} title={activePitch?.subject || 'Pitch'} width={600}>
        {activePitch && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
              To {activePitch.contacts?.name || 'Unknown'} · via {activePitch.channel} · angle:{' '}
              {activePitch.angle_used || '—'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--white)', lineHeight: 1.6 }}>
              {activePitch.body || <span style={{ color: 'var(--dim2)' }}>No body content.</span>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
