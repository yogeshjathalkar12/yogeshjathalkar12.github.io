import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { isNotInstalled } from '../../lib/dbMissing';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { formatCurrency } from '../../lib/crmHelpers';
import { buildReport, change, reportText, weekStart, type ReportData } from '../../lib/weeklyReport';

// CRM > Weekly results: one week against the week before, to print or paste for a client (lib/weeklyReport.ts).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.9rem 1.1rem', marginBottom: 10 };
const small: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 };
const button: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: 4, padding: '0.35rem 0.8rem', fontSize: '0.64rem', cursor: 'pointer' };
const PRINT = `@media print {
  body * { visibility: hidden; }
  .weekly, .weekly * { visibility: visible; color: #000 !important; background: #fff !important; }
  .weekly { position: absolute; left: 0; top: 0; width: 100%; overflow: visible !important; }
  .no-print { display: none !important; }
}`;

async function load(from: Date): Promise<ReportData> {
  // everything from the start of the week before up to the end of the chosen week
  const since = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7).toISOString();
  const until = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7).toISOString();
  const read = async <T,>(build: () => any): Promise<T[] | null> => {
    const result = await selectAll<T>(build);
    if (!result.error) return result.data || [];
    if (isNotInstalled(result.error)) return null;
    throw result.error;
  };
  const between = (table: string, columns: string, column: string) => () => supabase.from(table).select(columns).gte(column, since).lt(column, until).order(column);
  const [events, campaigns, prospects, deals, calls, tasks, stages] = await Promise.all([
    read<any>(between('pattern_events', 'id, company_name, channel, outcome, created_at', 'created_at')),
    read<any>(between('email_campaign_recipients', 'id, sent_at, opened_at, clicked_at', 'sent_at')),
    read<any>(between('prospect_dossiers', 'id, entity_name, created_at', 'created_at')),
    read<any>(() => supabase.from('deals').select('*').or(`created_at.gte.${since},closed_at.gte.${since}`).order('id')),
    read<any>(between('calls', 'id, company_name, started_at, duration_seconds, metrics', 'started_at'))
      .then((rows) => rows ?? read<any>(between('calls', 'id, company_name, started_at, duration_seconds', 'started_at'))),
    read<any>(between('tasks', 'id, done_at', 'done_at')),
    loadPipelineStages(),
  ]);
  const keys = (type: 'won' | 'lost') => [...new Set([type, ...stages.filter((s) => s.type === type).map((s) => s.key)])];
  return { events, campaigns, prospects, deals, calls, tasks, wonStages: keys('won'), lostStages: keys('lost') };
}

export default function CrmWeekly() {
  const [back, setBack] = useState(1);                          // last full week
  const from = useMemo(() => weekStart(new Date(), back), [back]);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    setCopied(false);
    load(from).then((d) => { if (current) setData(d); }).catch((e) => { if (current) setError(e.message || 'Could not load the report.'); });
    return () => { current = false; };
  }, [from]);

  const report = data ? buildReport(data, from) : null;
  const heading = title.trim() || 'Weekly results';
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const weeks = Array.from({ length: 12 }, (_, i) => i);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(report!, heading, formatCurrency));
      setCopied(true);
    } catch {
      setError('Could not copy. Use Print and save it as a PDF instead.');
    }
  };

  return (
    <div className="weekly" style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
      <style>{PRINT}</style>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select aria-label="Week" value={back} onChange={(e) => setBack(Number(e.target.value))} style={{ ...button, background: 'var(--surface)' }}>
          {weeks.map((n) => <option key={n} value={n}>{n === 0 ? 'This week so far' : n === 1 ? 'Last week' : `Week of ${day(weekStart(new Date(), n))}`}</option>)}
        </select>
        <input aria-label="Report title" placeholder="Title, for example the client's name" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} style={{ ...button, cursor: 'text', flex: '1 1 200px' }} />
        <button type="button" style={button} disabled={!report} onClick={copy}>{copied ? 'Copied' : 'Copy as text'}</button>
        <button type="button" style={button} disabled={!report} onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {!report && !error && <div style={small}>Loading…</div>}
      {report && (
        <>
          <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem', color: 'var(--white)' }}>{heading}</h2>
          <div style={{ ...small, marginBottom: 10 }}>{day(report.from)} to {day(new Date(report.to.getTime() - 86400000))}</div>
          {report.sections.map((s) => (
            <div key={s.title} style={card}>
              <div style={{ fontSize: '0.56rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)', marginBottom: 8 }}>{s.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {s.figures.map((f) => (
                  <div key={f.label}>
                    <div style={small}>{f.label}</div>
                    <div style={{ fontSize: '1.15rem', color: 'var(--white)' }}>{f.money ? formatCurrency(f.now) : f.now}</div>
                    <div style={small}>{f.money && f.now !== f.before ? `${f.now > f.before ? 'up' : 'down'} from ${formatCurrency(f.before)}` : change(f)}</div>
                  </div>
                ))}
              </div>
              {(s.names || []).filter((n) => n.list.length).map((n) => <div key={n.label} style={{ ...small, marginTop: 8 }}><span style={{ color: 'var(--white)' }}>{n.label}:</span> {n.list.slice(0, 30).join(', ')}{n.list.length > 30 ? ` and ${n.list.length - 30} more` : ''}</div>)}
              {s.note && <div style={{ ...small, marginTop: 8 }}>{s.note}</div>}
            </div>
          ))}
          <div className="no-print" style={small}>
            Counted from what is saved online and what you are allowed to see. Outreach sent from the PC app appears after it has synced.
            {report.missing.length ? ` Not included because it is not set up: ${report.missing.join(', ')}.` : ''}
          </div>
        </>
      )}
    </div>
  );
}
