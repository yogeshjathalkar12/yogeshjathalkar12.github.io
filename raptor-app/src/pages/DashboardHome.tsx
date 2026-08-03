import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { TOOLS } from '../tools/registry';

export default function DashboardHome() {
  const { user } = useAuth();
  const { credits, totalCredits } = useCredits();
  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];

  // CRM Placeholder Data
  const activeLeads = [
    { id: 1, company: "Acme Corp", contact: "John Doe", status: "Negotiation", value: "$45,000", lastTouch: "2 hrs ago" },
    { id: 2, company: "TechFlow Inc", contact: "Sarah Smith", status: "Discovery Call", value: "$12,500", lastTouch: "1 day ago" },
    { id: 3, company: "Global Logistics", contact: "Mike Johnson", status: "Contract Sent", value: "$89,000", lastTouch: "3 hrs ago" },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <div className="arsenal-hero-eyebrow">ShoonyaOrigins · Raptor</div>
      <h1 className="arsenal-hero-title" style={{ marginBottom: '2rem' }}>Command Center. Welcome, {displayName}.</h1>

      <div className="arsenal-stats" style={{ marginBottom: '3rem' }}>
        <div className="arsenal-stat">
          <div className="arsenal-stat-label">Available Credits</div>
          <div className="arsenal-stat-value accent">{credits ?? '—'}</div>
        </div>
        <div className="arsenal-stat">
          <div className="arsenal-stat-label">Plan Cap</div>
          <div className="arsenal-stat-value">{totalCredits}</div>
        </div>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'var(--dim2)', textTransform: 'uppercase' }}>
            Active Pipeline
          </div>
          <button style={{ backgroundColor: 'var(--accent)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
            + New Target
          </button>
        </div>
        
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Company</th>
                <th style={{ padding: '1rem' }}>Contact</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Deal Value</th>
                <th style={{ padding: '1rem' }}>Last Touch</th>
              </tr>
            </thead>
            <tbody>
              {activeLeads.map((lead) => (
                <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{lead.company}</td>
                  <td style={{ padding: '1rem' }}>{lead.contact}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>
                      {lead.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>{lead.value}</td>
                  <td style={{ padding: '1rem', color: 'var(--dim)' }}>{lead.lastTouch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'var(--dim2)', textTransform: 'uppercase', marginBottom: '1rem' }}>
        Intelligence Suite
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
    </div>
  );
}