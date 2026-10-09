import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { useTheme } from '../hooks/ThemeContext';
import { TOOLS } from '../tools/registry';
import { NotificationBell } from '../components/NotificationBell';
import { PaymentModal } from './PaymentModal';
import GlobalSearch from '../components/GlobalSearch';

// Profile photo from the sign-in provider (Google sends `picture`/`avatar_url`).
// Password-only accounts have none, so they keep the initial-letter circle.
function photoUrlOf(user: any): string | null {
  const meta = user?.user_metadata || {};
  const fromIdentity = (user?.identities || [])
    .map((i: any) => i?.identity_data?.avatar_url || i?.identity_data?.picture)
    .find(Boolean);
  return meta.avatar_url || meta.picture || fromIdentity || null;
}

function UserAvatar({ photoUrl, letter, size }: { photoUrl: string | null; letter: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size, fontSize: size > 34 ? '1rem' : undefined } : undefined;
  return (
    <div className="dash-user-avatar" style={style}>
      {photoUrl && !failed ? (
        <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        letter
      )}
    </div>
  );
}

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { credits, totalCredits, plan, planLoaded } = useCredits();
  const { isLight, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  // Same behaviour as the desktop app: hide the sidebar, bring it back with the
  // "Menu" tab, and remember the choice.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('raptor_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('raptor_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // storage blocked - the choice just won't persist
    }
  }, [sidebarCollapsed]);

  // Screens that lock a feature behind Pro (Email automation) ask for the
  // upgrade dialog with this event instead of owning a payment flow.
  useEffect(() => {
    const open = () => setShowPayment(true);
    window.addEventListener('raptor:open-payment', open);
    return () => window.removeEventListener('raptor:open-payment', open);
  }, []);

  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];
  const fullName = user?.user_metadata?.full_name || displayName;
  const photoUrl = photoUrlOf(user);
  const initial = displayName[0]?.toUpperCase() ?? '';
  const isPro = plan.toLowerCase() === 'pro';
  // A small "PRO" tag on the locked sections for Free accounts (hidden until the plan is known).
  const proTag = !isPro && planLoaded ? <span style={{ marginLeft: 'auto', fontSize: '0.5rem', letterSpacing: '0.1em', padding: '0.1rem 0.35rem', borderRadius: 3, border: '1px solid var(--purple)', color: 'var(--purple)' }}>PRO</span> : null;

  // "Intelligence Suite" tools vs "automation" tools
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
          <GlobalSearch />

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

          <NotificationBell />

          <div className="lamp-container" onClick={toggle} title="Toggle theme">
            <div className="lamp-wire" />
            <div className="lamp-socket" />
            <div className="lamp-bulb" style={{ background: isLight ? '#ffaa00' : '#cbd5e1' }} />
          </div>

          <div className="dash-user" onClick={() => setMenuOpen((v) => !v)} style={{ position: 'relative' }}>
            <UserAvatar photoUrl={photoUrl} letter={initial} />
            <div className="dash-user-name">{displayName}</div>

            {menuOpen && (
              <div
                className="dash-user-dropdown open"
                style={{ minWidth: 260, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', paddingBottom: '0.7rem', borderBottom: '1px solid var(--border)' }}>
                  <UserAvatar photoUrl={photoUrl} letter={initial} size={36} />
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

      <div className={`dash-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <nav className="dash-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }} aria-hidden={sidebarCollapsed}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <button type="button" className="dash-sidebar-collapse-btn" title="Hide sidebar" onClick={() => setSidebarCollapsed(true)}>
              ‹‹ Hide
            </button>
            <div className="dash-sidebar-section-label">Command Center</div>
            <NavLink to="/dashboard" end className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">⊞</span><span>Dashboard</span>
            </NavLink>

            <NavLink to="/crm" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">◫</span><span>Automated CRM</span>
            </NavLink>
            <NavLink to="/sync" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">⇄</span><span>Desktop Sync</span>
            </NavLink>

            <div className="dash-sidebar-section-label">Automation</div>
            <NavLink to="/email" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">✉</span><span>Email</span>{proTag}
            </NavLink>
            <NavLink to="/whatsapp" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">◉</span><span>WhatsApp</span>{proTag}
            </NavLink>
            {automationTools.map((tool) => (
              <NavLink key={tool.slug} to={tool.route} className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
                <span className="dash-sidebar-icon">{tool.icon}</span><span>{tool.navLabel}</span>{proTag}
              </NavLink>
            ))}

            <div className="dash-sidebar-section-label">Training</div>
            <NavLink to="/playground" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">◆</span><span>AI Playground</span>{proTag}
            </NavLink>

            <div className="dash-sidebar-section-label">Intelligence Suite</div>
            {intelligenceTools.map((tool) => (
              <NavLink key={tool.slug} to={tool.route} className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
                <span className="dash-sidebar-icon">{tool.icon}</span><span>{tool.navLabel}</span>
              </NavLink>
            ))}

            <div className="dash-sidebar-section-label">Account</div>
            <NavLink to="/credits" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">◇</span><span>Credits &amp; Plan</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `dash-sidebar-item${isActive ? ' active' : ''}`}>
              <span className="dash-sidebar-icon">⚙</span><span>Settings</span>
            </NavLink>
          </div>

          <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.6rem' }}>
              {plan} Plan · {totalCredits} Credits/mo
            </div>
            {!isPro && (
              <button
                className="dash-billing-btn-primary"
                style={{ width: '100%' }}
                onClick={() => setShowPayment(true)}
              >
                Upgrade to Pro →
              </button>
            )}
          </div>
        </nav>

        {sidebarCollapsed && (
          <button type="button" className="dash-sidebar-restore-tab" title="Show sidebar" onClick={() => setSidebarCollapsed(false)}>
            ›› Menu
          </button>
        )}

        <main className="dash-main">
          <Outlet />
        </main>
      </div>

      {showPayment && <PaymentModal plan={plan} onClose={() => setShowPayment(false)} />}
    </div>
  );
}