import { Link, NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/email/setup', label: 'Connection' },
  { path: '/email/campaigns', label: 'Campaigns' },
];

export default function EmailLayout() {
  return (
    <>
      <header className="arsenal-topbar">
        <Link to="/dashboard" className="arsenal-back">← Dashboard</Link>
        <div className="arsenal-tool-badge">
          <span className="dot" />
          EMAIL AUTOMATION
        </div>
        <div className="arsenal-topbar-right" />
      </header>

      <main className="arsenal-main">
        <section className="arsenal-hero">
          <div className="arsenal-hero-eyebrow">Bring Your Own Provider</div>
          <h1 className="arsenal-hero-title">Email Automation</h1>
          <p className="arsenal-hero-desc">
            Connect your own sending account and run warm-up-paced, spintax-varied campaigns —
            nothing routes through a shared identity or shared reputation.
          </p>
        </section>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          {TABS.map((t) => (
            <NavLink
              key={t.path}
              to={t.path}
              style={({ isActive }) => ({
                padding: '0.6rem 1rem',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                textDecoration: 'none',
                color: isActive ? 'var(--accent)' : 'var(--dim)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              })}
            >
              {t.label}
            </NavLink>
          ))}
        </div>

        <Outlet />
      </main>
    </>
  );
}