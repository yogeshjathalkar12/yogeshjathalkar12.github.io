import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { HistoryTable } from '../../components/HistoryTable';

interface DossierRow {
  id: string;
  entity_name: string;
  target_type: string;
  icp_match_score: number;
  company_id: string | null;
  contact_id: string | null;
  decision_makers: any[] | null;
  updated_at: string;
}

export default function SyncDossiers() {
  const [rows, setRows] = useState<DossierRow[] | null>(null);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel('sync-dossiers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospect_dossiers' }, fetchRows)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchRows() {
    const { data, error } = await supabase
      .from('prospect_dossiers')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load prospect dossiers:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  return (
    <div className="arsenal-card">
      <div className="arsenal-card-header">
        <span className="arsenal-card-title">Prospect Dossiers</span>
      </div>
      <div className="arsenal-card-body">
        <HistoryTable<DossierRow>
          rows={rows}
          keyField={(r) => r.id}
          emptyText="No prospect dossiers synced from the desktop app yet."
          columns={[
            { header: 'Entity', render: (r) => <span style={{ color: 'var(--white)' }}>{r.entity_name}</span> },
            { header: 'Type', render: (r) => r.target_type },
            { header: 'ICP Score', render: (r) => r.icp_match_score },
            {
              header: 'Promoted',
              render: (r) =>
                r.company_id || r.contact_id ? (
                  <span style={{ color: 'var(--green)' }}>Promoted</span>
                ) : (
                  <span style={{ color: 'var(--dim2)' }}>Not promoted</span>
                ),
            },
            { header: 'Decision Makers', render: (r) => (r.decision_makers || []).length },
          ]}
        />
      </div>
    </div>
  );
}
