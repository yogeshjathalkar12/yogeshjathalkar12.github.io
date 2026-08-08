import { NavLink, Outlet } from 'react-router-dom';

export default function CrmLayout() {
  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* CRM Sub-Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {[
          { name: 'Overview', path: '/crm/overview' },
          { name: 'Pipeline', path: '/crm/pipeline' },
          { name: 'Contacts', path: '/crm/contacts' },
          { name: 'Activity', path: '/crm/activity' },
          { name: 'Automations', path: '/crm/automations' },
          { name: 'Campaigns', path: '/crm/campaigns' }
        ].map((tab) => (
          <NavLink
            key={tab.name}
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
            {tab.name}
          </NavLink>
        ))}
      </nav>

      {/* The specific CRM page (Pipeline, Contacts, etc.) renders here */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}