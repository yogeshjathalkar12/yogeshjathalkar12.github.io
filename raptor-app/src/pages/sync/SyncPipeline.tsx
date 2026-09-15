import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { HistoryTable } from '../../components/HistoryTable';
import { relativeTime } from '../../lib/crmHelpers';

interface PipelineRow {
  id: string;
  company_name: string;
  stage: string;
  metadata: Record<string, any> | null;
  crm_contact_id: string | null;
  promoted_at: string | null;
  updated_at: string;
  contacts: { id: string; name: string } | null;
}

export default function SyncPipeline() {
  const [rows, setRows] = useState<PipelineRow[] | null>(null);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel('sync-pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline' }, fetchRows)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchRows() {
    const { data, error } = await supabase
      .from('pipeline')
      .select('*, contacts(id, name)')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load pipeline sync data:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  return (
    <div className="arsenal-card">
      <div className="arsenal-card-header">
        <span className="arsenal-card-title">Desktop Pipeline</span>
      </div>
      <div className="arsenal-card-body">
        <HistoryTable<PipelineRow>
          rows={rows}
          keyField={(r) => r.id}
          emptyText="No pipeline records synced from the desktop app yet."
          columns={[
            { header: 'Company', render: (r) => <span style={{ color: 'var(--white)' }}>{r.company_name}</span> },
            { header: 'Stage', render: (r) => r.stage?.replace(/_/g, ' ') || '—' },
            { header: 'ICP Score', render: (r) => r.metadata?.icp_score ?? <span style={{ color: 'var(--dim2)' }}>—</span> },
            {
              header: 'Promoted',
              render: (r) =>
                r.promoted_at ? relativeTime(r.promoted_at) : <span style={{ color: 'var(--dim2)' }}>—</span>,
            },
            {
              header: 'Linked Contact',
              // ?contactId= isn't read by CrmContacts.tsx yet - separate
              // follow-up. This link is correct once that lands; until
              // then it just opens the Contacts list.
              render: (r) =>
                r.crm_contact_id && r.contacts ? (
                  <Link to={`/crm/contacts?contactId=${r.crm_contact_id}`} style={{ color: 'var(--purple)' }}>
                    {r.contacts.name}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--dim2)' }}>Not promoted</span>
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}
