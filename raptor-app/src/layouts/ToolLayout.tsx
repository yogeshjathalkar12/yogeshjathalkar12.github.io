import type { ReactNode } from 'react';
import { useCredits } from '../hooks/CreditsContext';
import type { ToolMeta } from '../tools/registry';

interface ToolLayoutProps {
  tool: ToolMeta;
  children: ReactNode;
}

export function ToolLayout({ tool, children }: ToolLayoutProps) {
  const { credits } = useCredits();

  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', gap: '1.5rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {tool.eyebrow}
          </div>
          <h1 style={{ margin: '0.3rem 0', color: 'var(--purple)' }}>{tool.title}</h1>
          <p style={{ color: 'var(--dim)', maxWidth: '640px', fontSize: '0.85rem' }}>{tool.description}</p>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem', fontSize: '0.7rem', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            <div>Cost <strong style={{ color: 'var(--white)' }}>{tool.costLabel}</strong></div>
            <div>Engine <strong style={{ color: 'var(--white)' }}>{tool.engineLabel}</strong></div>
            {tool.extraMeta?.map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            Credits
          </div>
          <div style={{ fontSize: '1.1rem', color: 'var(--white)', fontFamily: 'var(--mono)' }}>{credits ?? '—'}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}