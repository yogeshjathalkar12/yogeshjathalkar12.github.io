import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { useTheme } from '../hooks/ThemeContext';
import { TOOLS } from '../tools/registry';
import { PaymentModal } from './PaymentModal';

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { credits, totalCredits, plan } = useCredits();
  const { isLight, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];
  const fullName = user?.user_metadata?.full_name || displayName;
  const isPro = plan.toLowerCase() === 'pro';

  // "Intelligence Suite" is the original Arsenal tools; "automation" tools
  // (currently just AI Content) get their own section below, next to
  // Email/WhatsApp — none of those three are credit-metered utilities the
  // way chronos/kmeans/montecarlo are, so they don't belong in the same list.
  const intelligenceTools = TOOLS.filter((t) => (t.category ?? 'intelligence') === 'intelligence');
  const automationTools = TOOLS.filter((t) => t.category === 'automation');
  const contentTool = automationTools.find((t) => t.slug === 'content');

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

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

          <button
            className={`dash-billing-btn${isPro ? '' : ' dash-billing-btn-primary'}`}
            onClick={() => setShowPayment(true)}
          >
            {isPro ? 'Buy More Credits' : 'Upgrade to Pro'}
          </button>

          <div className="lamp-container" onClick={toggle} title="Toggle theme">
            <div className="lamp-wire" />
            <div className="lamp-socket" />
            <div className="lamp-bulb" style={{ background: isLight ? '#ffaa00' : '#cbd5e1' }} />
          </div>

          <div className="dash-user" onClick={() => setMenuOpen((v) => !v)} style={{ position: 'relative' }}>
            <div className="dash-user-avatar">{displayName[0]?.toUpperCase()}</div>
            <div className="dash-user-name">{displayName}</div>

            {menuOpen && (
              <div
                className="dash-user-dropdown open"
                style={{ minWidth: 260, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', paddingBottom: '0.7rem', borderBottom: '1px solid var(--border)' }}>
                  <div className="dash-user-avatar" style={{ width: 36, height: 36, fontSize: '1rem' }}>
                    {displayName[0]?.toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--white)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fullName}
                    </div>
                    <div style={{ color: 'var(--dim)', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                  <span style={{ color: 'var(--dim)' }}>Plan</span>
                  <strong style={{ color: 'var(--white)' }}>{plan}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                  <span style={{ color: 'var(--dim)' }}>Credits</span>
                  <strong style={{ color: 'var(--white)' }}>{credits ?? '—'} / {totalCredits}</strong>
                </div>
                {memberSince && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                    <span style={{ color: 'var(--dim)' }}>Member since</span>
                    <strong style={{ color: 'var(--white)' }}>{memberSince}</strong>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <NavLink to="/email/setup" className="dash-user-dropdown-item" style={{ display: 'block', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                    Manage Email Account
                  </NavLink>
                  <NavLink to="/whatsapp/setup" className="dash-user-dropdown-item" style={{ display: 'block', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                    Manage WhatsApp Account
                  </NavLink>
                  {contentTool && (
                    <NavLink to={contentTool.route} className="dash-user-dropdown-item" style={{ display: 'block', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                      Manage AI Provider Keys
                    </NavLink>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                  <div className="dash-user-dropdown-item danger" onClick={signOut}>→ Log Out</div>
                </div>
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

          <div className="dash-sidebar-section-label">Automation</div>
          <NavLink to="/email" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
            <span className="dash-sidebar-icon">✉</span><span>Email</span>
          </NavLink>
          <NavLink to="/whatsapp" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
            <span className="dash-sidebar-icon">◉</span><span>WhatsApp</span>
          </NavLink>
          {automationTools.map((tool) => (
            <NavLink key={tool.slug} to={tool.route} className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">{tool.icon}</span><span>{tool.navLabel}</span>
            </NavLink>
          ))}

          <div className="dash-sidebar-section-label">Intelligence Suite</div>
          {intelligenceTools.map((tool) => (
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

      {showPayment && <PaymentModal plan={plan} onClose={() => setShowPayment(false)} />}
    </div>
  );
}