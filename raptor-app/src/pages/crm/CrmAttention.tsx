import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { formatCurrency } from '../../lib/crmHelpers';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { loadAttentionData, type AttentionData } from '../../lib/attentionData';
import { dealsNeedingAttention, type DealAttention, type WarningKind } from '../../lib/dealWarnings';
import { useOrg } from '../../hooks/OrgContext';
import { useAuth } from '../../hooks/AuthContext';
import { SignalRows } from '../../components/crm/CompanySignals';
import type { CompanySignal } from '../../lib/companySignals';
import AssigneeFilter, { applyAssigneeFilter, useAssigneeFilter } from '../../components/crm/AssigneeFilter';

// CRM > Needs attention: open deals with something overdue, quiet or unanswered (lib/dealWarnings.ts).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem 1rem', marginBottom: 8 };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };
const button: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: 4, padding: '0.3rem 0.7rem', fontSize: '0.62rem', cursor: 'pointer', whiteSpace: 'nowrap' };
const COLOURS = { 3: 'var(--red)', 2: 'var(--amber, #f59e0b)', 1: 'var(--dim)' } as const;
const FILTERS: Array<[WarningKind | '', string]> = [['', 'Everything'], ['quiet', 'Gone quiet'], ['no_next_step', 'No next step'], ['concern', 'Unanswered concerns'], ['competitor', 'Competitor mentioned'], ['task_overdue', 'Overdue tasks'], ['close_passed', 'Close date passed']];
const SHOWN = 50;

/** What was found lately on watched companies' pages. Shown only when there is something. */
function RecentSignals() {
  const [rows, setRows] = useState<CompanySignal[]>([]);
  const load = useCallback(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    Promise.resolve(supabase.from('company_signals').select('*, companies ( name )').neq('status', 'dismissed').gte('found_at', since).order('found_at', { ascending: false }).limit(15))
      .then((r) => setRows((r.data || []) as CompanySignal[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows.length) return null;
  const dismiss = (id: string) => { Promise.resolve(supabase.from('company_signals').update({ status: 'dismissed' }).eq('id', id)).then(load).catch(() => {}); };
  return (
    <div style={card}>
      <div style={{ ...small, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>News from companies you watch, last 30 days</div>
      <SignalRows rows={rows} onDismiss={dismiss} withCompany />
    </div>
  );
}

export default function CrmAttention() {
  const { can } = useOrg();
  const { user } = useAuth();
  const [data, setData] = useState<(AttentionData & { deals: any[]; stages: any[] }) | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<WarningKind | ''>('');
  const [shown, setShown] = useState(SHOWN);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [assignee, setAssignee] = useAssigneeFilter('attention');

  const load = useCallback(async () => {
    try {
      const [deals, stages, rest] = await Promise.all([selectAll<any>(() => supabase.from('deals').select('*, companies(id, name)')), loadPipelineStages(), loadAttentionData()]);
      if (deals.error) throw deals.error;
      setData({ ...rest, deals: deals.data || [], stages });
    } catch (e: any) {
      setError(e.message || 'Could not load the deals.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <div style={{ ...small, color: 'var(--red)' }}>{error}</div>;
  if (!data) return <div style={small}>Loading…</div>;

  const all: DealAttention[] = dealsNeedingAttention(applyAssigneeFilter(data.deals, assignee, user?.id), data.stages, data);
  const list = kind ? all.filter((r) => r.warnings.some((w) => w.kind === kind)) : all;

  async function addTask(row: DealAttention) {
    setError('');
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(10, 0, 0, 0);
    const first = row.warnings[0];
    const { error: failed } = await supabase.from('tasks').insert({
      title: `Follow up: ${row.deal.title}`.slice(0, 200), notes: first.text, deal_id: row.deal.id, contact_id: row.deal.contact_id || null,
      assignee_id: row.deal.assignee_id || null, due_at: tomorrow.toISOString(),
    });
    if (failed) { setError(/row-level security|permission/i.test(failed.message) ? 'You may not add tasks.' : failed.message); return; }
    setAdded((a) => ({ ...a, [row.deal.id]: true }));
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <AssigneeFilter value={assignee} onChange={setAssignee} />
        <select aria-label="Show" value={kind} onChange={(e) => { setKind(e.target.value as WarningKind | ''); setShown(SHOWN); }} style={{ ...button, background: 'var(--surface)' }}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={small}>{list.length} open deal{list.length === 1 ? '' : 's'}</span>
      </div>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {!kind && <RecentSignals />}
      {data.missing.length > 0 && <div style={{ ...small, marginBottom: 8 }}>Not checked because it is not set up yet: {data.missing.join(', ')}.</div>}
      {list.length === 0 && <div style={card}><div style={small}>Nothing needs attention here. A deal appears when a date has passed, nothing has happened for two weeks, or its last call left something open.</div></div>}
      {list.slice(0, shown).map((row) => (
        <div key={row.deal.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ color: 'var(--white)', fontSize: '0.78rem' }}>{row.deal.title}</div>
              <div style={small}>{(row.deal as any).companies?.name ? `${(row.deal as any).companies.name} · ` : ''}{formatCurrency(row.deal.value || 0)}</div>
              {row.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '0.68rem', lineHeight: 1.7, color: COLOURS[w.level] }}>
                  {w.text}{w.callId && <> <Link to={`/calls/${w.callId}${w.line === undefined ? '' : `?line=${w.line}`}`} style={{ color: 'var(--purple)' }}>See the call</Link></>}
                </div>
              ))}
            </div>
            {can('create') && <button type="button" style={button} disabled={added[row.deal.id]} onClick={() => addTask(row)}>{added[row.deal.id] ? 'Task added for tomorrow' : 'Add a task for tomorrow'}</button>}
          </div>
        </div>
      ))}
      {list.length > shown && <button type="button" style={button} onClick={() => setShown(shown + SHOWN)}>Show more</button>}
    </div>
  );
}
