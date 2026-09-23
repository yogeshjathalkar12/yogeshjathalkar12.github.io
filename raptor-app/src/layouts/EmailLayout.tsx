import { NavLink, Outlet } from 'react-router-dom';
import { useCredits } from '../hooks/CreditsContext';

const TABS = [
  { path: '/email/setup', label: 'Connection' },
  { path: '/email/campaigns', label: 'Campaigns' },
  { path: '/email/segments', label: 'Segments' },
  { path: '/email/triggers', label: 'Triggers' },
  { path: '/email/followups', label: 'Follow-ups' },
  { path: '/email/sequences', label: 'Sequences' },
  { path: '/email/analytics', label: 'Analytics' },
  { path: '/email/guide', label: 'Guide' },
];

export default function EmailLayout() {
  const { plan, planLoaded } = useCredits();
  const isPro = plan.toLowerCase() === 'pro';

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

      {!planLoaded ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.75rem' }}>Loading…</div>
      ) : !isPro ? (
        <ProGate />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}
// Shown instead of the Email screens on the Free plan. The server enforces
// the same rule (it refuses to connect a mailbox unless the plan is Pro), so
// this is the friendly half of the lock, not the only half.
function ProGate() {
  return (
    <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 8, padding: '1.6rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>Pro feature</div>
      <h2 style={{ margin: '0.5rem 0', color: 'var(--white)' }}>Email automation is on the Pro plan</h2>
      <p style={{ color: 'var(--dim)', fontSize: '0.8rem', lineHeight: 1.7 }}>
        Connect your own mailbox and run campaigns, sequences, triggers and follow-ups from it, at a human pace,
        with your own sending limits, opt-outs and analytics.
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('raptor:open-payment'))}
        style={{ marginTop: '0.6rem', background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.7rem 1.4rem', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        Upgrade to Pro
      </button>
    </div>
  );
}
