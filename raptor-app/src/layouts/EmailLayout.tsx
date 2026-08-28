import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/email/setup', label: 'Connection' },
  { path: '/email/campaigns', label: 'Campaigns' },
];

export default function EmailLayout() {
  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
          Bring Your Own Provider
        </div>
        <h1 style={{ margin: '0.3rem 0', color: 'var(--purple)' }}>Email Automation</h1>
        <p style={{ color: 'var(--dim)', maxWidth: '640px', fontSize: '0.85rem' }}>
          Connect your own sending account and run warm-up-paced, spintax-varied campaigns —
          nothing routes through a shared identity or shared reputation.
        </p>
      </div>

      {/* Email Sub-Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              paddingBottom: '0.8rem',
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              color: isActive ? 'var(--purple)' : 'var(--dim)',
              borderBottom: isActive ? '2px solid var(--purple)' : '2px solid transparent',
              fontFamily: 'var(--mono)',
              transition: 'all 0.2s ease'
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}