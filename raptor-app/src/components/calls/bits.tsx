// Small pieces shared by the call and competitor screens.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { mmss, type Card } from '../../lib/calls/measuresView';

export const card: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' };
export const heading: CSSProperties = { fontSize: '0.56rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)', marginBottom: 6 };
export const small: CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 };
export const body: CSSProperties = { fontSize: '0.74rem', color: 'var(--white)', lineHeight: 1.6 };
export const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' };
export const th: CSSProperties = { textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)', color: 'var(--dim)', fontWeight: 500, whiteSpace: 'nowrap' };
export const td: CSSProperties = { padding: '0.5rem', borderBottom: '1px solid var(--border)', color: 'var(--white)', verticalAlign: 'top' };
export const chip = (on = false): CSSProperties => ({
  background: on ? 'rgba(168,85,247,0.18)' : 'transparent', border: `1px solid ${on ? 'var(--purple)' : 'var(--border)'}`, color: 'var(--white)',
  borderRadius: 14, padding: '0.25rem 0.7rem', fontSize: '0.62rem', cursor: 'pointer',
});
export const link: CSSProperties = { background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.62rem', padding: 0 };

const TONES = { good: 'var(--green, #22c55e)', watch: 'var(--amber, #f59e0b)', plain: 'var(--white)' };

export const Problem = ({ text }: { text: string }) => (text ? <div role="alert" style={{ color: 'var(--red)', fontSize: '0.66rem', margin: '6px 0' }}>{text}</div> : null);
export const Needs = ({ file }: { file: string }) => <div style={{ ...small, ...card }}>This part needs the database update {file} (run it once in Supabase).</div>;

export function Page({ children }: { children: ReactNode }) {
  return <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>{children}</div>;
}

export function MeasureCards({ cards, selected, onSelect }: { cards: Card[]; selected: string; onSelect: (key: string, lines: number[]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {cards.map((c) => (
        <button
          key={c.key} type="button" disabled={!c.lines.length} aria-pressed={selected === c.key} onClick={() => onSelect(c.key, c.lines)}
          style={{ textAlign: 'left', background: 'var(--surface)', border: `1px solid ${selected === c.key ? 'var(--purple)' : 'var(--border)'}`, borderRadius: 6, padding: '0.6rem', cursor: c.lines.length ? 'pointer' : 'default' }}
        >
          <span style={{ display: 'block', fontSize: '0.54rem', color: 'var(--dim)' }}>{c.label}</span>
          <strong style={{ display: 'block', fontSize: '1.05rem', color: TONES[c.tone] }}>{c.value}</strong>
          {c.hint && <span style={{ display: 'block', fontSize: '0.54rem', color: 'var(--dim)' }}>{c.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ShownLine { who: string; at: number | null; seconds?: number; text: string }

/** Who spoke when, as one strip across the length of the call. Only for calls whose lines carry times. */
export function SpeakerBar({ lines, duration, onPick }: { lines: ShownLine[]; duration: number; onPick: (line: number) => void }) {
  if (!lines.length || lines.some((l) => l.at === null || l.at === undefined)) return null;
  const length = Math.max(duration, ...lines.map((l) => (l.at as number) + (l.seconds || 1)), 1);
  const rows = [{ label: 'Our side', test: (l: ShownLine) => l.who === 'You', colour: 'var(--green, #22c55e)' }, { label: 'Them', test: (l: ShownLine) => l.who !== 'You', colour: 'var(--purple)' }];
  return (
    <div aria-label="Who spoke when">
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ ...small, width: 56, flex: 'none' }}>{row.label}</span>
          <div style={{ position: 'relative', flex: 1, height: 12, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            {lines.map((l, i) => (row.test(l) ? (
              <button
                key={i} type="button" title={`${mmss(l.at)} ${l.text.slice(0, 80)}`} aria-label={`Line at ${mmss(l.at)}`} onClick={() => onPick(i)}
                style={{ position: 'absolute', left: `${(100 * (l.at as number)) / length}%`, width: `${Math.max(0.4, (100 * (l.seconds || 1)) / length)}%`, top: 0, bottom: 0, border: 'none', padding: 0, background: row.colour, cursor: 'pointer' }}
              />
            ) : null))}
          </div>
        </div>
      ))}
      <div style={{ ...small, display: 'flex', justifyContent: 'space-between', paddingLeft: 64 }}><span>0:00</span><span>{mmss(length)}</span></div>
    </div>
  );
}

export function Transcript({ lines, marked, onLine }: { lines: ShownLine[]; marked: number[]; onLine?: (line: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const first = marked.length ? marked[0] : -1;
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-line="${first}"]`);
    if (box.current && row) box.current.scrollTop = row.offsetTop - box.current.offsetTop - 30;
  }, [first, marked]);
  return (
    <div ref={box} style={{ ...card, maxHeight: 420, overflowY: 'auto', marginBottom: 0 }}>
      {lines.length === 0 && <div style={small}>No transcript recorded.</div>}
      {lines.map((l, i) => (
        <div
          key={i} data-line={i} data-marked={marked.includes(i) ? 'yes' : undefined} onClick={onLine ? () => onLine(i) : undefined}
          style={{ display: 'flex', gap: 8, fontSize: '0.7rem', lineHeight: 1.7, borderRadius: 4, cursor: onLine ? 'pointer' : 'default', background: marked.includes(i) ? 'rgba(168,85,247,0.18)' : undefined }}
        >
          <span style={{ color: 'var(--dim2)', minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>{mmss(l.at)}</span>
          <span style={{ color: 'var(--dim)' }}>
            {l.who && <strong style={{ color: l.who === 'You' ? 'var(--green, #22c55e)' : 'var(--white)' }}>{l.who === 'You' ? 'Our side' : l.who}: </strong>}
            <span dir="auto">{l.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
