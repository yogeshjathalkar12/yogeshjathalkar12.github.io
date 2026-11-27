import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { isNotInstalled } from '../../lib/dbMissing';
import { useColumn } from '../../hooks/useColumn';
import { useAuth } from '../../hooks/AuthContext';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { loadPipelineStages, type PipelineStage } from '../../lib/pipelineStages';
import { loadPipelines } from '../../lib/pipelines';
import { dealProbability } from '../../lib/forecast';
import { type ReportConfig, type ReportContext, type Source, SOURCE_TABLES, STARTERS, blankConfig, fieldsOf, readConfig, runReport } from '../../lib/reports';
import Modal, { fieldInputStyle, fieldLabelStyle, ghostBtnStyle, primaryBtnStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import ReportBuilder from '../../components/crm/ReportBuilder';
import ReportView from '../../components/crm/ReportView';
import ExportButton from '../../components/crm/ExportButton';

// CRM > Dashboard: the organization's own reports (db/migrations/2026-11-28_o_reports.sql).

interface Saved { id: string; name: string; config: any; created_by: string | null; dashboard?: string }

const MAIN_DASHBOARD = 'Main';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1rem 1.1rem', minWidth: 0 };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };

export default function CrmDashboard() {
  const { user } = useAuth();
  const { isOwner, isAdmin } = useOrg();
  const { entries } = useDirectory();
  const [reports, setReports] = useState<Saved[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<Partial<Record<Source, any[]>>>({});
  const [failed, setFailed] = useState<Partial<Record<Source, string>>>({});
  const [lookups, setLookups] = useState<{ stages: PipelineStage[]; pipelines: Record<string, string>; companies: Record<string, string>; custom: any[] } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; dashboard: string; config: ReportConfig } | null>(null);
  const boards = useColumn('saved_reports', 'dashboard') === true;      // several dashboards: 2026-11-29_e_dashboards.sql
  const [board, setBoard] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const asked = useRef(new Set<Source>());

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from('saved_reports').select('*').order('created_at', { ascending: true });
    if (error) { setState(isNotInstalled(error) ? 'missing' : 'error'); setMessage(error.message); return; }
    setReports((rows || []) as Saved[]);
    setState('ready');
  }, []);
  useEffect(() => { load(); }, [load]);

  // names the records point at; a part that cannot be read is simply left blank
  useEffect(() => {
    if (state !== 'ready') return;
    Promise.all([
      loadPipelineStages().catch(() => [] as PipelineStage[]),
      loadPipelines(supabase),
      selectAll(() => supabase.from('companies').select('id, name')),
      Promise.resolve(supabase.from('custom_field_defs').select('id, entity_type, name, field_type')),
    ]).then(([stages, pipelines, companies, custom]) => setLookups({
      stages,
      pipelines: Object.fromEntries(pipelines.map((p) => [p.id, p.name])),
      companies: Object.fromEntries(((companies.data || []) as any[]).map((c) => [c.id, c.name])),
      custom: (custom.data || []) as any[],
    }));
  }, [state]);

  // each kind of record is fetched once, when a report first needs it
  const wanted = useMemo(() => {
    const set = new Set<Source>(reports.map((r) => readConfig(r.config).source));
    if (editing) set.add(editing.config.source);
    return [...set];
  }, [reports, editing]);
  useEffect(() => {
    for (const source of wanted) {
      if (asked.current.has(source)) continue;
      asked.current.add(source);
      selectAll(() => supabase.from(SOURCE_TABLES[source]).select('*')).then(({ data: rows, error }) => {
        if (error) { asked.current.delete(source); setFailed((f) => ({ ...f, [source]: error.message })); return; }
        setData((d) => ({ ...d, [source]: rows || [] }));
      });
    }
  }, [wanted]);

  const context: ReportContext = useMemo(() => ({
    stages: lookups?.stages || [],
    pipelines: lookups?.pipelines || {},
    companies: lookups?.companies || {},
    custom: lookups?.custom || [],
    people: Object.fromEntries(entries.map((e) => [e.user_id, shortName(e.email)])),
    probability: (deal: any) => dealProbability(deal, lookups?.stages || []),
  }), [lookups, entries]);

  const mine = (r: Saved) => r.created_by === user?.id || isOwner || isAdmin;
  // the dashboards there are, "Main" first; a dashboard exists as long as a report is on it
  const names = useMemo(() => [...new Set([MAIN_DASHBOARD, ...reports.map((r) => r.dashboard || MAIN_DASHBOARD)])], [reports]);
  const current = names.includes(board) ? board : names.find((n) => reports.some((r) => (r.dashboard || MAIN_DASHBOARD) === n)) || MAIN_DASHBOARD;
  const onBoard = boards ? reports.filter((r) => (r.dashboard || MAIN_DASHBOARD) === current) : reports;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) { setProblem('Give the report a name.'); return; }
    setSaving(true);
    setProblem('');
    const dashboard = editing.dashboard.trim() === MAIN_DASHBOARD ? '' : editing.dashboard.trim();
    const row = { name: editing.name.trim(), config: editing.config, ...(boards ? { dashboard } : {}) };
    const { error } = editing.id
      ? await supabase.from('saved_reports').update(row).eq('id', editing.id)
      : await supabase.from('saved_reports').insert(row);
    setSaving(false);
    if (error) { setProblem(error.message); return; }
    if (boards) setBoard(dashboard || MAIN_DASHBOARD);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this report? No records are affected.')) return;
    const { error } = await supabase.from('saved_reports').delete().eq('id', id);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function addStarters() {
    setProblem('');
    for (const s of STARTERS) {
      const { error } = await supabase.from('saved_reports').insert({ name: s.name, config: s.config });
      if (error) { setProblem(error.message); break; }
    }
    load();
  }

  const open = (r: Saved | null) => {
    setProblem('');
    setEditing(r ? { id: r.id, name: r.name, dashboard: r.dashboard || MAIN_DASHBOARD, config: readConfig(r.config, context) }
      : { id: null, name: '', dashboard: current, config: blankConfig() });
  };

  if (state === 'loading') return <div style={small}>Loading your dashboard…</div>;
  if (state === 'missing') return <div style={card}><div style={small}>Custom reports need a database update first: run <b>2026-11-28_o_reports.sql</b> in Supabase.</div></div>;
  if (state === 'error') return <div style={card}><div style={{ ...small, color: 'var(--red)' }}>Could not load the reports: {message}</div></div>;

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        <div style={{ ...small, maxWidth: 600 }}>Reports your team builds. Everyone sees the same list; the numbers cover the records each person is allowed to see.</div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          {reports.length > 0 && <button type="button" style={toolBtnStyle} onClick={() => window.print()}>Print or save as PDF</button>}
          <button type="button" style={toolPrimaryStyle} onClick={() => open(null)}>+ New report</button>
        </div>
      </div>
      {boards && names.length > 1 && (
        <div className="no-print" role="tablist" aria-label="Dashboards" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
          {names.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={n === current} onClick={() => setBoard(n)}
              style={{ ...toolBtnStyle, color: n === current ? 'var(--white)' : 'var(--dim)', borderColor: n === current ? 'var(--purple)' : 'var(--border)' }}>{n}</button>
          ))}
        </div>
      )}
      {problem && !editing && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}

      {reports.length === 0 && (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ ...small, marginBottom: 12 }}>No reports yet. Build your own, or start with four common ones.</div>
          <button type="button" style={toolBtnStyle} onClick={addStarters}>Add the four common reports</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        {onBoard.map((r) => {
          const config = readConfig(r.config, context);
          const rows = data[config.source];
          const result = rows && lookups ? runReport(config, rows, context) : null;
          const groupLabel = fieldsOf(config.source, context).find((f) => f.id === config.group)?.label || 'Group';
          return (
            <section key={r.id} style={card} aria-label={r.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--white)', overflowWrap: 'anywhere' }}>{r.name}</div>
                <div className="no-print" style={{ display: 'flex', gap: 6 }}>
                  {result && result.points.length > 0 && (
                    <ExportButton data={result.points.map((p) => ({ group: p.label, ...Object.fromEntries((result.series || []).map((s, i) => [`s${i}`, p.parts?.[s] ?? 0])), value: p.value, records: p.count }))}
                      columns={[{ key: 'group', label: groupLabel }, ...(result.series || []).map((s, i) => ({ key: `s${i}`, label: s })), { key: 'value', label: result.measureName }, { key: 'records', label: 'Records' }]}
                      filename={`${r.name.replace(/[^\w -]+/g, '').trim() || 'report'}.csv`} label="CSV" />
                  )}
                  {mine(r) && <button type="button" style={toolBtnStyle} onClick={() => open(r)}>Edit</button>}
                </div>
              </div>
              {failed[config.source] ? <div style={{ ...small, color: 'var(--red)' }}>Could not load: {failed[config.source]}</div>
                : !result ? <div style={{ ...small, padding: '2rem 0', textAlign: 'center' }}>Loading…</div>
                  : (
                    <>
                      <ReportView result={result} chart={config.chart} />
                      <div style={{ fontSize: '0.58rem', color: 'var(--dim)' }}>{result.measureName} · {result.count.toLocaleString()} record{result.count === 1 ? '' : 's'}</div>
                    </>
                  )}
            </section>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit report' : 'New report'} width={720}>
        {editing && (
          <form onSubmit={save} noValidate>
            <label style={fieldLabelStyle} htmlFor="r-name">Name</label>
            <input id="r-name" style={fieldInputStyle} value={editing.name} maxLength={80} placeholder="e.g. Won this quarter by person" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            {boards && (
              <>
                <label style={fieldLabelStyle} htmlFor="r-board">Dashboard (type a new name to make another)</label>
                <input id="r-board" style={fieldInputStyle} list="r-boards" value={editing.dashboard} maxLength={40} onChange={(e) => setEditing({ ...editing, dashboard: e.target.value })} />
                <datalist id="r-boards">{names.map((n) => <option key={n} value={n} />)}</datalist>
              </>
            )}
            <ReportBuilder config={editing.config} onChange={(config) => setEditing({ ...editing, config })} rows={data[editing.config.source] || []} context={context}
              loading={!data[editing.config.source] || !lookups} />
            {problem && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {editing.id && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => remove(editing.id as string)}>Delete</button>}
              <button type="button" style={ghostBtnStyle} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={saving}>{saving ? 'Saving…' : 'Save report'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
