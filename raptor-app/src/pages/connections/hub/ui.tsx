import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { FieldDef } from './core';
import type { Insight, Point, Tone } from './insights';

// Small building blocks shared by every Connections screen. Plain inline styles on the colour variables both apps define,
// and no chart library: a chart here is an SVG of a few lines.

export const dim: CSSProperties = { color: 'var(--dim)' };
export const note: CSSProperties = { fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6 };
const TONE: Record<Tone, string> = { good: '#3ecf8e', warn: '#f59e0b', info: '#8b5cf6' };
export const toneColor = (t: Tone): string => TONE[t];

export const inputStyle: CSSProperties = {
  width: '100%', padding: '9px 11px', background: 'var(--surface2, transparent)', border: '1px solid var(--border)', color: 'var(--white)',
  fontFamily: 'inherit', fontSize: 13, borderRadius: 5, boxSizing: 'border-box',
};
export const buttonStyle = (variant: 'primary' | 'ghost' | 'danger' = 'primary', disabled = false): CSSProperties => ({
  padding: '8px 14px', borderRadius: 5, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit',
  border: variant === 'primary' ? 'none' : `1px solid ${variant === 'danger' ? 'rgba(239,83,80,0.5)' : 'var(--border)'}`,
  background: variant === 'primary' ? 'var(--grad, #7c3aed)' : 'transparent',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#ef5350' : 'var(--white)', flex: 'none', width: 'auto',
});

export function Card({ title, right, children, style }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface)', ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface)', minWidth: 130, flex: '1 1 130px' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, margin: '4px 0 2px', color: 'var(--white)' }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: tone ? TONE[tone] : 'var(--dim)' }}>{sub}</div> : null}
    </div>
  );
}

export const TileRow = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>;

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...note, padding: '14px 0' }}>{children}</div>;
}

// ───────────── charts ─────────────

/** A line chart of a daily series; days with no data are skipped, not drawn as zero. */
export function Spark({ points, height = 70, color = '#8b5cf6', format = (n: number) => String(n) }: { points: Point[]; height?: number; color?: string; format?: (n: number) => string }) {
  const real = points.map((p, i) => ({ i, v: p.value, day: p.day })).filter((p) => p.v !== null) as { i: number; v: number; day: string }[];
  if (real.length < 2) return <Empty>The chart appears once there are two or more days of data.</Empty>;
  const w = 600, pad = 6;
  const min = Math.min(...real.map((p) => p.v)), max = Math.max(...real.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = real.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(real[real.length - 1].i).toFixed(1)},${height - pad} L${x(real[0].i).toFixed(1)},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Trend chart">
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {real.map((p) => <circle key={p.day} cx={x(p.i)} cy={y(p.v)} r={real.length > 40 ? 0 : 2.5} fill={color}><title>{`${p.day}: ${format(p.v)}`}</title></circle>)}
    </svg>
  );
}

/** A bar chart of a daily series. */
export function Bars({ points, height = 80, color = '#3ecf8e', format = (n: number) => String(n) }: { points: Point[]; height?: number; color?: string; format?: (n: number) => string }) {
  const values = points.map((p) => p.value || 0);
  const max = Math.max(...values, 0);
  if (!points.length || max === 0) return <Empty>Nothing to chart in this period yet.</Empty>;
  const w = 600, gap = 2, bw = (w - gap * (points.length - 1)) / points.length;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Bar chart">
      {points.map((p, i) => {
        const h = Math.max(p.value ? 2 : 0, ((p.value || 0) / max) * (height - 4));
        return <rect key={p.day} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={1.5} fill={color} opacity={p.value ? 0.9 : 0.15}><title>{`${p.day}: ${format(p.value || 0)}`}</title></rect>;
      })}
    </svg>
  );
}

/** A ranked list with a bar behind each row (top pages, top sources). */
export function Ranked({ items, format = (n: number) => String(n) }: { items: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <Empty>Nothing to show yet.</Empty>;
  return (
    <div>
      {items.map((it) => (
        <div key={it.label} style={{ position: 'relative', padding: '6px 8px', marginBottom: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ position: 'absolute', inset: 0, width: `${(it.value / max) * 100}%`, background: 'rgba(139,92,246,0.14)', borderRadius: 4 }} />
          <span style={{ position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--white)' }}>{it.label}</span>
          <span style={{ position: 'relative', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────── insights, notices, status ─────────────

export function InsightList({ items, onOpen, empty = 'Insights appear here once there is data to read.' }: { items: Insight[]; onOpen?: (tab: string) => void; empty?: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: TONE[it.tone], marginTop: 7, flex: 'none' }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--white)', flex: 1 }}>
            {it.text}
            {it.tab && onOpen ? <> <a href="#open" onClick={(e) => { e.preventDefault(); onOpen(it.tab as string); }} style={{ color: '#8b5cf6' }}>Open</a></> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <div role={tone === 'warn' ? 'alert' : 'status'} style={{ border: `1px solid ${TONE[tone]}55`, background: `${TONE[tone]}14`, borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.55, color: 'var(--white)', margin: '10px 0' }}>{children}</div>;
}

const STATUS: Record<string, { text: string; color: string }> = {
  connected: { text: 'Connected', color: '#3ecf8e' }, error: { text: 'Needs attention', color: '#ef5350' }, paused: { text: 'Paused', color: '#9ca3af' }, pending: { text: 'Setting up', color: '#9ca3af' },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize: 11, color: s.color, border: `1px solid ${s.color}66`, borderRadius: 999, padding: '2px 9px' }}>{s.text}</span>;
}

export function Stars({ n }: { n: number }) {
  return <span aria-label={`${n} out of 5 stars`} style={{ color: n <= 2 ? '#ef5350' : n === 3 ? '#f59e0b' : '#3ecf8e', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, 5 - n))}</span></span>;
}

// ───────────── forms ─────────────

export function CopyBox({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the address is visible: select it by hand */ }
  }
  return (
    <div>
      {label ? <div style={{ ...note, marginBottom: 4 }}>{label}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <input readOnly value={text} onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
        <button type="button" style={buttonStyle('ghost')} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

export function FieldInput({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `f-${field.name}`;
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
        {field.label}{field.required ? '' : ' (optional)'}
      </label>
      {field.options ? (
        <select id={id} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.multiline ? (
        <textarea id={id} style={{ ...inputStyle, minHeight: 90, fontFamily: field.secret ? 'var(--mono, monospace)' : 'inherit', fontSize: field.secret ? 11 : 13 }} value={value} placeholder={field.placeholder} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} style={inputStyle} type={field.secret ? 'password' : 'text'} value={value} placeholder={field.placeholder} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.help ? <div style={{ ...note, fontSize: 12, marginTop: 4 }}>{field.help}</div> : null}
    </div>
  );
}

/** The values a form starts with: the first option of every choice, empty text otherwise. */
export function initialValues(fields: FieldDef[]): Record<string, string> {
  const v: Record<string, string> = {};
  fields.forEach((f) => { v[f.name] = f.options && f.options.length ? f.options[0].value : ''; });
  return v;
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol style={{ ...note, paddingLeft: 20, margin: '6px 0 12px' }}>
      {items.map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}
    </ol>
  );
}

export interface DraftResult { draft: string; skip: boolean }

/** The box a person writes a reply in. "Draft with AI" fills it with a suggestion from their own AI key; nothing is sent until they press Send. */
export function ReplyComposer({ placeholder, busy, limit, onSend, onCancel, onDraft }: {
  placeholder: string; busy: boolean; limit: number; onSend: (text: string) => void; onCancel: () => void; onDraft?: () => Promise<DraftResult>;
}) {
  const [text, setText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [hint, setHint] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);

  async function draft() {
    if (!onDraft) return;
    setDrafting(true);
    setHint(null);
    try {
      const out = await onDraft();
      if (out.skip || !out.draft) setHint({ tone: 'info', text: 'The AI thinks this does not need an answer (it looks like spam or an advert). You can still write your own.' });
      else { setText(out.draft.slice(0, limit)); setHint({ tone: 'info', text: 'AI draft. Read it, change anything you like, then press Send. It is not sent until you do.' }); }
    } catch (e: any) {
      setHint({ tone: 'warn', text: e.message || 'Could not draft a reply. Try again.' });
    } finally {
      setDrafting(false);
    }
  }

  const stuck = busy || drafting;
  return (
    <div style={{ marginTop: 6 }}>
      <textarea style={{ ...inputStyle, minHeight: 70, marginBottom: 8 }} maxLength={limit} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      {hint ? <div style={{ ...note, marginBottom: 8, color: hint.tone === 'warn' ? '#f59e0b' : 'var(--dim)' }}>{hint.text}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle('primary', stuck || !text.trim())} disabled={stuck || !text.trim()} onClick={() => onSend(text)}>{busy ? 'Sending…' : 'Send reply'}</button>
        {onDraft ? <button type="button" style={buttonStyle('ghost', stuck)} disabled={stuck} onClick={draft}>{drafting ? 'Drafting…' : text.trim() ? 'Draft again with AI' : 'Draft with AI'}</button> : null}
        <button type="button" style={buttonStyle('ghost', stuck)} disabled={stuck} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
