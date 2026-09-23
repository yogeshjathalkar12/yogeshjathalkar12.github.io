// components/guide/GuidePanel.tsx
// Shared renderer for the in-app "Guide" tab on Email, WhatsApp and CRM.
// Content lives as plain data in each module's Guide.tsx (EmailGuide.tsx
// etc.) — this file only knows how to lay it out, so the three guides stay
// visually identical and a wording fix never touches markup.
import type { ReactNode } from 'react';

export interface GuideStep {
  title: string;
  body: ReactNode;
}

export interface GuideSection {
  id: string;
  label: string; // shown in the jump-to sidebar
  heading: string;
  intro?: ReactNode;
  steps?: GuideStep[];
  note?: ReactNode; // a highlighted callout, for limits/warnings
  table?: { headers: string[]; rows: ReactNode[][] };
}

interface GuidePanelProps {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: GuideSection[];
}

const wrap: React.CSSProperties = { display: 'flex', gap: '2rem', height: '100%', overflow: 'hidden' };
const nav: React.CSSProperties = {
  width: 200, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)',
  paddingRight: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem',
};
const navLink: React.CSSProperties = {
  fontSize: '0.65rem', letterSpacing: '0.05em', color: 'var(--dim)', textDecoration: 'none',
  padding: '0.4rem 0.5rem', borderRadius: '4px', fontFamily: 'var(--mono)',
};
const content: React.CSSProperties = { flex: 1, overflowY: 'auto', paddingRight: '0.5rem', maxWidth: 760 };
const sectionStyle: React.CSSProperties = { marginBottom: '2.6rem', scrollMarginTop: '1rem' };
const headingStyle: React.CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '0.03em',
  color: 'var(--white)', marginBottom: '0.8rem',
};
const introStyle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '1.2rem' };
const stepRow: React.CSSProperties = { display: 'flex', gap: '1rem', padding: '0.9rem 0', borderTop: '1px solid var(--border)' };
const stepNum: React.CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem', color: 'var(--purple)', width: '1.6rem', flexShrink: 0,
};
const stepTitle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--white)', marginBottom: '0.3rem', fontWeight: 600 };
const stepBody: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--dim)', lineHeight: 1.65 };
const noteStyle: React.CSSProperties = {
  marginTop: '1rem', padding: '0.8rem 1rem', fontSize: '0.68rem', lineHeight: 1.6,
  background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--purple)',
  color: 'var(--dim)', borderRadius: '4px',
};
const tableWrap: React.CSSProperties = { marginTop: '1rem', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '4px' };
const th: React.CSSProperties = {
  textAlign: 'left', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--purple)', padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)',
};
const td: React.CSSProperties = { fontSize: '0.68rem', color: 'var(--dim)', padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function GuidePanel({ eyebrow, title, intro, sections }: GuidePanelProps) {
  return (
    <div style={wrap}>
      <nav style={nav}>
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={navLink}>{s.label}</a>
        ))}
      </nav>
      <div style={content}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)', marginBottom: '0.3rem' }}>
          {eyebrow}
        </div>
        <h2 style={{ ...headingStyle, fontSize: '1.6rem', marginBottom: '0.6rem' }}>{title}</h2>
        <div style={introStyle}>{intro}</div>

        {sections.map((s) => (
          <section key={s.id} id={s.id} style={sectionStyle}>
            <div style={headingStyle}>{s.heading}</div>
            {s.intro && <div style={introStyle}>{s.intro}</div>}
            {s.steps && s.steps.map((step, i) => (
              <div key={i} style={stepRow}>
                <div style={stepNum}>{String(i + 1).padStart(2, '0')}</div>
                <div>
                  <div style={stepTitle}>{step.title}</div>
                  <div style={stepBody}>{step.body}</div>
                </div>
              </div>
            ))}
            {s.table && (
              <div style={tableWrap}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{s.table.headers.map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => <td key={j} style={td}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.note && <div style={noteStyle}>{s.note}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
