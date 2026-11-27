import { useMemo } from 'react';
import { fieldInputStyle, fieldLabelStyle, toolBtnStyle } from './Modal';
import ReportView from './ReportView';
import {
  type Filter, type Op, type ReportConfig, type ReportContext, type Source, OP_NAMES, PERIODS, SOURCE_NAMES,
  blankConfig, fieldsOf, opsFor, runReport,
} from '../../lib/reports';

// The choices that make up a report, with the answer shown underneath as they are made.

const pair: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', columnGap: 12 };

export default function ReportBuilder({ config, onChange, rows, context, loading }: {
  config: ReportConfig;
  onChange: (next: ReportConfig) => void;
  rows: any[];
  context: ReportContext;
  loading: boolean;
}) {
  const fields = useMemo(() => fieldsOf(config.source, context), [config.source, context]);
  const numbers = fields.filter((f) => f.kind === 'number');
  const dates = fields.filter((f) => f.kind === 'date');
  const result = useMemo(() => runReport(config, rows, context), [config, rows, context]);
  const set = (patch: Partial<ReportConfig>) => onChange({ ...config, ...patch });
  const setFilterAt = (i: number, patch: Partial<Filter>) => set({ filters: config.filters.map((f, n) => (n === i ? { ...f, ...patch } : f)) });

  // the answers a choice filter can pick from: what the records hold
  const choicesFor = (id: string): string[] => {
    const field = fields.find((f) => f.id === id);
    if (!field || (field.kind !== 'choice' && field.kind !== 'tags')) return [];
    const seen = new Set<string>(field.order || []);
    rows.forEach((r) => [field.get(r)].flat().forEach((v) => v && seen.add(String(v))));
    return [...seen].slice(0, 200);
  };

  return (
    <div>
      <div style={pair}>
        <div>
          <label style={fieldLabelStyle} htmlFor="r-source">About</label>
          <select id="r-source" style={fieldInputStyle} value={config.source} onChange={(e) => onChange({ ...blankConfig(e.target.value as Source), chart: config.chart })}>
            {Object.entries(SOURCE_NAMES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle} htmlFor="r-measure">Show</label>
          <select id="r-measure" style={fieldInputStyle} value={config.measure} onChange={(e) => set({ measure: e.target.value as ReportConfig['measure'], value: config.value || numbers[0]?.id || '' })}>
            <option value="count">How many</option>
            {numbers.length > 0 && <option value="sum">Total of</option>}
            {numbers.length > 0 && <option value="average">Average of</option>}
          </select>
        </div>
        {config.measure !== 'count' && (
          <div>
            <label style={fieldLabelStyle} htmlFor="r-value">Number</label>
            <select id="r-value" style={fieldInputStyle} value={config.value} onChange={(e) => set({ value: e.target.value })}>
              {numbers.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={fieldLabelStyle} htmlFor="r-group">Grouped by</label>
          <select id="r-group" style={fieldInputStyle} value={config.group} onChange={(e) => set({ group: e.target.value, split: e.target.value && config.split !== e.target.value ? config.split : undefined })}>
            <option value="">Nothing (one number)</option>
            {fields.filter((f) => f.kind !== 'number').map((f) => <option key={f.id} value={f.id}>{f.kind === 'date' ? `Month: ${f.label}` : f.label}</option>)}
          </select>
        </div>
        {config.group !== '' && (
          <div>
            <label style={fieldLabelStyle} htmlFor="r-split">Then split by</label>
            <select id="r-split" style={fieldInputStyle} value={config.split || ''} onChange={(e) => set({ split: e.target.value || undefined })}>
              <option value="">Nothing</option>
              {fields.filter((f) => (f.kind === 'choice' || f.kind === 'text' || f.kind === 'tags') && f.id !== config.group).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={fieldLabelStyle} htmlFor="r-period">Period</label>
          <select id="r-period" style={fieldInputStyle} value={config.period} onChange={(e) => set({ period: e.target.value })}>
            {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {config.period !== 'all' && (
          <div>
            <label style={fieldLabelStyle} htmlFor="r-date">Of which date</label>
            <select id="r-date" style={fieldInputStyle} value={config.periodField} onChange={(e) => set({ periodField: e.target.value })}>
              {dates.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={fieldLabelStyle} htmlFor="r-chart">Draw as</label>
          <select id="r-chart" style={fieldInputStyle} value={config.chart} onChange={(e) => set({ chart: e.target.value as ReportConfig['chart'] })}>
            <option value="bar">Bars</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
            <option value="table">Table</option>
            <option value="number">One number</option>
          </select>
        </div>
      </div>

      <div style={fieldLabelStyle}>Only records where</div>
      {config.filters.map((filter, i) => {
        const field = fields.find((f) => f.id === filter.field);
        const choices = filter.op === 'is' || filter.op === 'is_not' ? choicesFor(filter.field) : [];
        const needsValue = filter.op !== 'filled' && filter.op !== 'empty';
        const input: React.CSSProperties = { ...fieldInputStyle, marginBottom: 0, flex: '1 1 130px', width: 'auto' };
        return (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={input} aria-label={`Filter ${i + 1} field`} value={filter.field}
              onChange={(e) => setFilterAt(i, { field: e.target.value, op: opsFor(fields.find((f) => f.id === e.target.value)!.kind)[0], value: '' })}>
              {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <select style={input} aria-label={`Filter ${i + 1} test`} value={filter.op} onChange={(e) => setFilterAt(i, { op: e.target.value as Op })}>
              {opsFor(field?.kind || 'text').map((op) => <option key={op} value={op}>{field?.kind === 'date' && op === 'over' ? 'is after' : field?.kind === 'date' && op === 'under' ? 'is before' : OP_NAMES[op]}</option>)}
            </select>
            {needsValue && (choices.length > 0 ? (
              <select style={input} aria-label={`Filter ${i + 1} value`} value={filter.value} onChange={(e) => setFilterAt(i, { value: e.target.value })}>
                <option value="">Choose…</option>
                {filter.value && !choices.includes(filter.value) && <option value={filter.value}>{filter.value}</option>}
                {choices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input style={input} aria-label={`Filter ${i + 1} value`} type={field?.kind === 'number' ? 'number' : field?.kind === 'date' ? 'date' : 'text'} value={filter.value} onChange={(e) => setFilterAt(i, { value: e.target.value })} />
            ))}
            <button type="button" style={toolBtnStyle} aria-label={`Remove filter ${i + 1}`} onClick={() => set({ filters: config.filters.filter((_, n) => n !== i) })}>✕</button>
          </div>
        );
      })}
      {config.filters.length < 8 && (
        <button type="button" style={{ ...toolBtnStyle, marginBottom: 14 }} onClick={() => set({ filters: [...config.filters, { field: fields[0].id, op: opsFor(fields[0].kind)[0], value: '' }] })}>+ Add a condition</button>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.8rem', marginBottom: 14 }}>
        {loading ? <div style={{ fontSize: '0.7rem', color: 'var(--dim)', padding: '2rem 0', textAlign: 'center' }}>Loading records…</div> : (
          <>
            <ReportView result={result} chart={config.chart} />
            <div style={{ fontSize: '0.58rem', color: 'var(--dim)' }}>{result.count.toLocaleString()} record{result.count === 1 ? '' : 's'} counted.</div>
          </>
        )}
      </div>
    </div>
  );
}
