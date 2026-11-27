import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { formatCurrency } from '../../lib/crmHelpers';
import { loadPipelineStages, type PipelineStage } from '../../lib/pipelineStages';
import { buildForecast, dealProbability, type ForecastDeal, type ForecastRow } from '../../lib/forecast';
import { useColumn } from '../../hooks/useColumn';
import { useAuth } from '../../hooks/AuthContext';
import AssigneeFilter, { applyAssigneeFilter, useAssigneeFilter } from '../../components/crm/AssigneeFilter';

// CRM > Forecast: what is likely to close, month by month (lib/forecast.ts; db/migrations/2026-11-28_b_forecast.sql).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.3rem' };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };
const cell: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap' };

const monthName = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export default function CrmForecast() {
  const installed = useColumn('deals', 'expected_close');
  const { user } = useAuth();
  const [deals, setDeals] = useState<any[] | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [error, setError] = useState('');
  const [assignee, setAssignee] = useAssigneeFilter('forecast');

  useEffect(() => {
    Promise.all([
      selectAll(() => supabase.from('deals').select('*, companies(id, name)')),
      loadPipelineStages(),
    ]).then(([d, s]) => {
      if (d.error) throw d.error;
      setDeals(d.data || []);
      setStages(s);
    }).catch((e) => setError(e.message || 'Could not load the deals.'));
  }, []);

  if (error) return <div style={{ ...small, color: 'var(--red)' }}>{error}</div>;
  if (installed === false) return <div style={card}><div style={small}>The forecast needs a database update first: run <b>2026-11-28_b_forecast.sql</b> in Supabase.</div></div>;
  if (!deals) return <div style={small}>Loading the forecast…</div>;

  const shown = applyAssigneeFilter(deals, assignee, user?.id) as ForecastDeal[];
  const f = buildForecast(shown, stages);
  const rows: [string, ForecastRow][] = [
    ...(f.overdue.deals ? [['Close date has passed', f.overdue] as [string, ForecastRow]] : []),
    ...f.months.map((m) => [monthName(m.key), m] as [string, ForecastRow]),
    ...(f.later.deals ? [['Later', f.later] as [string, ForecastRow]] : []),
    ...(f.undated.deals ? [['No close date', f.undated] as [string, ForecastRow]] : []),
  ];
  const best = Math.max(1, ...f.months.map((m) => m.weighted + m.won));
  const needDates = [...f.overdueDeals, ...f.undatedDeals];

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ ...small, maxWidth: 560 }}>
          <b>Likely</b> is each open deal's value times its chance of closing. <b>If all close</b> is the full value. <b>Won</b> is what has already closed that month.
        </div>
        <AssigneeFilter value={assignee} onChange={setAssignee} />
      </div>

      <div style={{ ...card, overflowX: 'auto', marginBottom: '1.2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ color: 'var(--dim)' }}>
              <th style={{ ...cell, textAlign: 'left' }}>Month</th><th style={cell}>Open deals</th><th style={cell}>If all close</th><th style={cell}>Likely</th><th style={cell}>Won</th><th style={{ ...cell, width: '30%' }} aria-label="Likely and won, compared" />
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, r]) => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...cell, textAlign: 'left', color: r.key === 'overdue' ? 'var(--red)' : 'var(--white)' }}>{name}</td>
                <td style={cell}>{r.deals}</td>
                <td style={cell}>{formatCurrency(r.total)}</td>
                <td style={{ ...cell, color: 'var(--purple)' }}>{formatCurrency(Math.round(r.weighted))}</td>
                <td style={{ ...cell, color: 'var(--green)' }}>{r.won ? formatCurrency(r.won) : '—'}</td>
                <td style={cell}>
                  {f.months.includes(r) && (
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}>
                      <div style={{ width: `${(r.won / best) * 100}%`, background: 'var(--green)' }} />
                      <div style={{ width: `${(r.weighted / best) * 100}%`, background: 'var(--purple)' }} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {needDates.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: '0.72rem', color: 'var(--white)', marginBottom: 8 }}>Open deals that need a close date ({needDates.length})</div>
          {needDates.slice(0, 50).map((d: any) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--border)', padding: '0.45rem 0', fontSize: '0.68rem' }}>
              <Link style={{ color: 'var(--purple)' }} to={`/crm/pipeline?open=${d.id}`}>{d.title}</Link>
              <span style={{ color: 'var(--dim)' }}>{d.companies?.name || ''}{d.expected_close ? ` · was ${new Date(`${d.expected_close}T00:00:00`).toLocaleDateString()}` : ''} · {formatCurrency(d.value)} · {dealProbability(d, stages)}%</span>
            </div>
          ))}
          {needDates.length > 50 && <div style={small}>…and {needDates.length - 50} more.</div>}
        </div>
      )}
    </div>
  );
}
