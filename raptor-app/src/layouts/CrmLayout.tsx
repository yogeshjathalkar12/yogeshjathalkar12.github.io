import { NavLink, Outlet } from 'react-router-dom';

export default function CrmLayout() {
  return (
    <div className="crm-shell">
      {/* CRM Sub-Navigation Tabs */}
      <nav className="crm-tabs">
        {[
          { name: 'Overview', path: '/crm/overview' },
          { name: 'Dashboard', path: '/crm/dashboard' },
          { name: 'Pipeline', path: '/crm/pipeline' },
          { name: 'Forecast', path: '/crm/forecast' },
          { name: 'Quotes', path: '/crm/quotes' },
          { name: 'Contacts', path: '/crm/contacts' },
          { name: 'Companies', path: '/crm/companies' },
          { name: 'Tasks', path: '/crm/tasks' },
          { name: 'Activity', path: '/crm/activity' },
          { name: 'Automations', path: '/crm/automations' },
          { name: 'Web forms', path: '/crm/forms' },
          { name: 'Booking', path: '/crm/booking' },
          { name: 'Campaigns', path: '/crm/campaigns' },
          { name: 'Tickets', path: '/crm/tickets' },
          { name: 'Analytics', path: '/crm/analytics' },
          { name: 'Reports', path: '/crm/reports' },
          { name: 'Marketing', path: '/crm/marketing' },
          { name: 'API', path: '/crm/api' },
          { name: 'Recycle bin', path: '/crm/trash' },
          { name: 'Guide', path: '/crm/guide' },
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
              transition: 'all 0.2s ease',
            })}
          >
            {tab.name}
          </NavLink>
        ))}
      </nav>

      {/* The specific CRM page (Pipeline, Contacts, etc.) renders here */}
      <div className="crm-outlet">
        <Outlet />
      </div>
    </div>
  );
}