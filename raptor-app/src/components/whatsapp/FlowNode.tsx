import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

export const KIND_COLORS: Record<string, string> = {
  start: 'var(--green)',
  message: 'var(--purple)',
  question: '#3b82f6',
  buttons: '#eab308',
  list: '#f97316',
  condition: '#ef4444',
  ai_reply: 'var(--purple)',
  handoff: 'var(--red)',
  end: 'var(--dim)',
};

export const KIND_LABELS: Record<string, string> = {
  start: 'Start',
  message: 'Message',
  question: 'Question',
  buttons: 'Buttons',
  list: 'List',
  condition: 'Condition',
  ai_reply: 'AI Reply',
  handoff: 'Hand Off',
  end: 'End',
};

const TERMINAL_KINDS = new Set(['handoff', 'end']);

export default function FlowNode({ data, selected }: NodeProps) {
  const branches: string[] = data.branches || [];
  const isTerminal = TERMINAL_KINDS.has(data.kind);
  const isStart = data.kind === 'start';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1.5px solid ${selected ? '#fff' : KIND_COLORS[data.kind] || 'var(--border)'}`,
        borderRadius: 6,
        padding: '0.6rem 0.9rem',
        minWidth: 170,
        maxWidth: 220,
        fontFamily: 'var(--mono)',
        boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none',
      }}
    >
      {!isStart && <Handle type="target" position={Position.Top} style={{ background: 'var(--dim)' }} />}

      <div style={{ fontSize: '0.55rem', color: KIND_COLORS[data.kind] || 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {KIND_LABELS[data.kind] || data.kind}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label || <span style={{ color: 'var(--dim2)' }}>(not configured)</span>}
      </div>

      {!isTerminal && branches.length === 0 && (
        <Handle type="source" position={Position.Bottom} id="default" style={{ background: 'var(--dim)' }} />
      )}

      {branches.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem', gap: '0.3rem', flexWrap: 'wrap' }}>
          {branches.map((b) => (
            <div key={b} style={{ position: 'relative', fontSize: '0.5rem', color: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 3, padding: '0.1rem 0.3rem', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b}
              <Handle type="source" position={Position.Bottom} id={b} style={{ background: KIND_COLORS[data.kind], position: 'absolute', left: '50%' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}