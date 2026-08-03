import { Link } from 'react-router-dom';
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
    <>
      <header className="arsenal-topbar">
        <Link to="/dashboard" className="arsenal-back">← Dashboard</Link>
        <div className="arsenal-tool-badge">
          <span className="dot" />
          {tool.navLabel.toUpperCase()}
        </div>
        <div className="arsenal-topbar-right">
          <div className="arsenal-credits-pill">
            <div>
              <div className="arsenal-credits-label">Credits</div>
              <div className="arsenal-credits-value">{credits ?? '—'}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="arsenal-main">
        <section className="arsenal-hero">
          <div className="arsenal-hero-eyebrow">{tool.eyebrow}</div>
          <h1 className="arsenal-hero-title">{tool.title}</h1>
          <p className="arsenal-hero-desc">{tool.description}</p>
          <div className="arsenal-hero-meta">
            <div className="arsenal-hero-meta-item">Cost <strong>{tool.costLabel}</strong></div>
            <div className="arsenal-hero-meta-item">Engine <strong>{tool.engineLabel}</strong></div>
            {tool.extraMeta?.map((m) => (
              <div className="arsenal-hero-meta-item" key={m}>{m}</div>
            ))}
          </div>
        </section>

        {children}
      </main>
    </>
  );
}
