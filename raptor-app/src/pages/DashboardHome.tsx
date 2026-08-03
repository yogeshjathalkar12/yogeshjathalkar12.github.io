import { Link } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { TOOLS } from '../tools/registry';

export default function DashboardHome() {
  const { user } = useAuth();
  const { credits, totalCredits } = useCredits();
  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];

  return (
    <DashboardLayout>
      <div className="arsenal-hero-eyebrow">ShoonyaOrigins · Raptor</div>
      <h1 className="arsenal-hero-title" style={{ marginBottom: '2rem' }}>Welcome Back, {displayName}.</h1>

      <div className="arsenal-stats" style={{ marginBottom: '2rem' }}>
        <div className="arsenal-stat">
          <div className="arsenal-stat-label">Available Credits</div>
          <div className="arsenal-stat-value accent">{credits ?? '—'}</div>
        </div>
        <div className="arsenal-stat">
          <div className="arsenal-stat-label">Plan Cap</div>
          <div className="arsenal-stat-value">{totalCredits}</div>
        </div>
      </div>

      <div style={{ fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--dim2)', textTransform: 'uppercase', marginBottom: '1rem' }}>
        Arsenal Tools
      </div>
      <div className="arsenal-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {TOOLS.map((tool) => (
          <Link key={tool.slug} to={tool.route} className="arsenal-card" style={{ padding: '1.4rem', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.4rem' }}>
              {tool.navLabel}
            </div>
            <div style={{ fontSize: '0.55rem', color: 'var(--dim)', lineHeight: 1.6 }}>{tool.costLabel}</div>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
