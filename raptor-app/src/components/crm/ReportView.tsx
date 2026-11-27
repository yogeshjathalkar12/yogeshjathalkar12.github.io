import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../lib/crmHelpers';
import type { Chart, ReportResult } from '../../lib/reports';

// One report's answer, drawn. A pie only makes sense for parts of a whole, so anything below zero falls back to bars.

const COLORS = ['#a855f7', '#ec4899', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#14b8a6', '#ef4444'];
const tip = { background: '#111', border: '1px solid #333', fontSize: 12, color: '#fff' };

export const shownValue = (result: ReportResult, value: number): string => (result.money ? formatCurrency(value) : value.toLocaleString());

export default function ReportView({ result, chart }: { result: ReportResult; chart: Chart }) {
  const empty = <div style={{ fontSize: '0.7rem', color: 'var(--dim)', padding: '2rem 0', textAlign: 'center' }}>No records match.</div>;
  if (chart === 'number' || result.points.length === 0) {
    if (result.count === 0) return empty;
    return (
      <div style={{ padding: '1.4rem 0', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.6rem', letterSpacing: '0.03em' }} data-testid="report-number">{shownValue(result, result.total)}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{result.measureName}</div>
      </div>
    );
  }
  if (result.count === 0) return empty;
  if (chart === 'table') {
    return (
      <div style={{ maxHeight: 260, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
          <thead>
            <tr style={{ color: 'var(--dim)', textAlign: 'left' }}>
              <th style={{ padding: '0.3rem' }}>Group</th>
              {(result.series || []).map((s) => <th key={s} style={{ padding: '0.3rem', textAlign: 'right' }}>{s}</th>)}
              <th style={{ padding: '0.3rem', textAlign: 'right' }}>{result.series ? 'All' : result.measureName}</th><th style={{ padding: '0.3rem', textAlign: 'right' }}>Records</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((p) => (
              <tr key={p.label} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.35rem', overflowWrap: 'anywhere' }}>{p.label}</td>
                {(result.series || []).map((s) => <td key={s} style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--dim)' }}>{shownValue(result, p.parts?.[s] || 0)}</td>)}
                <td style={{ padding: '0.35rem', textAlign: 'right' }}>{shownValue(result, p.value)}</td>
                <td style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--dim)' }}>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const pie = chart === 'pie' && result.points.every((p) => p.value >= 0);
  const series = pie ? undefined : result.series;                                            // a pie shows the first grouping only
  const flat = series ? result.points.map((p) => ({ ...p.parts, label: p.label })) : result.points;
  const stack = result.measureName.startsWith('Average') ? undefined : 'all';               // averages stand side by side, they do not add up
  const seriesFormat = (v: any, name: any) => [shownValue(result, Number(v)), name] as [string, string];
  const format = (v: any) => [shownValue(result, Number(v)), result.measureName] as [string, string];
  const axis = { stroke: '#777', fontSize: 11, tickLine: false };
  const compact = (v: number) => Intl.NumberFormat(undefined, { notation: 'compact' }).format(v);
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        {pie ? (
          <PieChart>
            <Pie data={result.points} dataKey="value" nameKey="label" outerRadius={90} isAnimationActive={false} label={(p: any) => p.label} fontSize={11}>
              {result.points.map((p, i) => <Cell key={p.label} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tip} formatter={(v: any, n: any) => [shownValue(result, Number(v)), n]} />
          </PieChart>
        ) : chart === 'line' ? (
          <LineChart data={flat} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#2a2a2a" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={compact} />
            <Tooltip contentStyle={tip} formatter={series ? seriesFormat : format} />
            {series ? series.map((s, i) => <Line key={s} type="linear" dataKey={(p: any) => p[s]} name={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />)
              : <Line type="linear" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />}
            {series && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </LineChart>
        ) : (
          <BarChart data={flat} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#2a2a2a" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={compact} />
            <Tooltip contentStyle={tip} formatter={series ? seriesFormat : format} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            {series ? series.map((s, i) => <Bar key={s} dataKey={(p: any) => p[s]} name={s} stackId={stack} fill={COLORS[i % COLORS.length]} isAnimationActive={false} />)
              : <Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />}
            {series && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
