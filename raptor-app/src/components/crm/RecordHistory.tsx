import { useEffect, useMemo, useState } from 'react';
import { type HistoryEntry, type HistoryTable, loadRecordHistory, shortName } from '../../lib/team';
import { useMemberLabels } from '../../hooks/useDirectory';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { formatCurrency, relativeTime } from '../../lib/crmHelpers';
import { fieldLabelStyle } from './Modal';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', email: 'Email', phone: 'Phone', status: 'Status', lead_score: 'Lead score', title: 'Title',
  value: 'Value', stage: 'Stage', assignee_id: 'Assigned to', linkedin_url: 'LinkedIn', website_url: 'Website',
  closed_at: 'Closed', meeting_at: 'Meeting', first_name: 'First name', last_name: 'Last name',
  company_id: 'Company', contact_id: 'Contact', campaign_id: 'Campaign', custom_fields: 'Custom fields', assigned_to: 'Assigned to (note)',
};
const ID_FIELDS = new Set(['company_id', 'contact_id', 'campaign_id']);
const SHOWN_AT_FIRST = 6;

interface RecordHistoryProps {
  table: HistoryTable;
  recordId: string;
  /** Bump to reload after the parent saved something. */
  refreshKey?: unknown;
}

// Who did what to this record, newest first. The database only returns
// history for records the signed-in person can see (owners and "see
// everyone's records" can also read the history of records since deleted).
export default function RecordHistory({ table, recordId, refreshKey }: RecordHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    loadRecordHistory(table, recordId)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the history.'); });
    if (table === 'deals') {
      loadPipelineStages().then((st) => { if (!cancelled) setStageLabels(Object.fromEntries(st.map((s) => [s.key, s.label]))); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [table, recordId, refreshKey]);

  const labelIds = useMemo(() => {
    const ids: Array<string | null> = [];
    (entries || []).forEach((e) => {
      ids.push(e.actor_id);
      const a = e.changes?.assignee_id;
      if (a) { ids.push(a.from as string | null, a.to as string | null); }
    });
    return ids;
  }, [entries]);
  const people = useMemberLabels(labelIds);

  const who = (id: string | null) => (id ? shortName(people[id]) : 'The system');
  const show = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'assignee_id') return v ? shortName(people[v as string]) : 'Unassigned';
    if (field === 'stage') return stageLabels[v as string] || String(v);
    if (field === 'value') return formatCurrency(Number(v));
    if (field === 'closed_at' || field === 'meeting_at') return new Date(v as string).toLocaleDateString();
    return String(v);
  };

  if (error) return null;
  if (entries === null) return null;
  if (entries.length === 0) return null;

  const visible = showAll ? entries : entries.slice(0, SHOWN_AT_FIRST);

  return (
    <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
      <label style={fieldLabelStyle}>History</label>
      {visible.map((e) => (
        <div key={e.id} style={{ padding: '0.5rem 0', borderTop: '1px solid var(--border)', fontSize: '0.64rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
            <span style={{ color: 'var(--white)' }}>
              {who(e.actor_id)}{' '}
              <span style={{ color: 'var(--dim)' }}>
                {e.action === 'create' ? 'created this' : e.action === 'delete' ? 'deleted this' : 'changed'}
              </span>
            </span>
            <span style={{ color: 'var(--dim2)', flexShrink: 0 }}>{relativeTime(e.created_at)}</span>
          </div>
          {e.action === 'update' && Object.entries(e.changes || {}).map(([field, ch]) => (
            <div key={field} style={{ color: 'var(--dim)', marginTop: '0.2rem', paddingLeft: '0.6rem' }}>
              {FIELD_LABELS[field] || field}
              {ID_FIELDS.has(field) || field === 'custom_fields'
                ? ' updated'
                : <>: {show(field, ch.from)} <span style={{ color: 'var(--dim2)' }}>&rarr;</span> <span style={{ color: 'var(--white)' }}>{show(field, ch.to)}</span></>}
            </div>
          ))}
        </div>
      ))}
      {entries.length > SHOWN_AT_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.58rem', padding: 0 }}
        >
          {showAll ? 'Show less' : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
