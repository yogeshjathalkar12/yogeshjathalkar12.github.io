import { Link, NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/whatsapp/setup', label: 'Connection' },
  { path: '/whatsapp/broadcasts', label: 'Broadcasts' },
  { path: '/whatsapp/sequences', label: 'Sequences' },
  { path: '/whatsapp/triggers', label: 'Triggers' },
];

export default function WhatsappLayout() {
  return (
    <>
      <header className="arsenal-topbar">
        <Link to="/dashboard" className="arsenal-back">← Dashboard</Link>
        <div className="arsenal-tool-badge">
          <span className="dot" />
          WHATSAPP AUTOMATION
        </div>
        <div className="arsenal-topbar-right" />
      </header>

      <main className="arsenal-main">
        <section className="arsenal-hero">
          <div className="arsenal-hero-eyebrow">Bring Your Own Meta App</div>
          <h1 className="arsenal-hero-title">WhatsApp Automation</h1>
          <p className="arsenal-hero-desc">
            Broadcasts, drip sequences, and keyword-triggered auto-replies on your own Meta
            WhatsApp Cloud API number — no reseller markup, no shared number.
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