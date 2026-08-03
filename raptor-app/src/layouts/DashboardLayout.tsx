import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { useTheme } from '../hooks/ThemeContext';
import { TOOLS } from '../tools/registry';

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { credits, totalCredits, plan } = useCredits();
  const { isLight, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];

  return (
    <div>
      <header className="dash-topbar">
        <div className="dash-topbar-logo">Raptor</div>
        <div className="dash-topbar-right">
          <div className={`dash-credits-pill${(credits ?? 0) <= 5 ? ' warn-low' : ''}`}>
            <div>
              <div className="dash-credits-label">Available Credits</div>
              <div className="dash-credits-value">{credits ?? '—'}</div>
              <div className="dash-credits-sub">of {totalCredits} · {plan} plan</div>
            </div>
          </div>

          <div className="lamp-container" onClick={toggle} title="Toggle theme">
            <div className="lamp-wire" />
            <div className="lamp-socket" />
            <div className="lamp-bulb" style={{ background: isLight ? '#ffaa00' : '#cbd5e1' }} />
          </div>

          <div className="dash-user" onClick={() => setMenuOpen((v) => !v)}>
            <div className="dash-user-avatar">{displayName[0]?.toUpperCase()}</div>
            <div className="dash-user-name">{displayName}</div>
            {menuOpen && (
              <div className="dash-user-dropdown open">
                <div className="dash-user-dropdown-item danger" onClick={signOut}>→ Log Out</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="dash-layout">
        <nav className="dash-sidebar">
          <div className="dash-sidebar-section-label">Command Center</div>
          <NavLink to="/dashboard" end className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
            <span className="dash-sidebar-icon">⊞</span><span>Dashboard</span>
          </NavLink>

          <NavLink to="/crm" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
            <span className="dash-sidebar-icon">◫</span><span>Active CRM</span>
          </NavLink>

          <div className="dash-sidebar-section-label">Intelligence Suite</div>
          {TOOLS.map((tool) => (
            <NavLink key={tool.slug} to={tool.route} className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">{tool.icon}</span><span>{tool.navLabel}</span>
            </NavLink>
          ))}
        </nav>

        {/* The Outlet renders the nested routes while keeping the sidebar intact */}
        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}