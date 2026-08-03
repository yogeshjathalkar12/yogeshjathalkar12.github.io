import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/AuthContext';
import { useCredits } from '../hooks/CreditsContext';
import { TOOLS } from '../tools/registry';
import { supabase } from '../lib/supabaseClient'; 

export default function DashboardHome() {
  const { user } = useAuth();
  const { credits, totalCredits } = useCredits();
  const displayName = (user?.user_metadata?.full_name || user?.email || 'User').split(' ')[0];

  const [activeLeads, setActiveLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  // Fetch all active deals from Supabase
  useEffect(() => {
    async function fetchActivePipeline() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('deals')
          .select(`
            id,
            title,
            value,
            stage,
            updated_at,
            companies ( name ),
            contacts ( name )
          `)
          .neq('stage', 'won')
          .neq('stage', 'lost')
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setActiveLeads(data || []);
      } catch (error) {
        console.error('Error fetching pipeline:', error);
      } finally {
        setLoadingLeads(false);
      }
    }

    fetchActivePipeline();
  }, [user]);

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return '—';
    const hours = Math.abs(new Date().getTime() - new Date(dateString).getTime()) / 36e5;
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

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
          <Link to="/crm/pipeline" style={{ backgroundColor: 'var(--accent)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.8rem', textDecoration: 'none' }}>
            Go to Pipeline →
          </Link>
        </div>
        
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Deal Title</th>
                <th style={{ padding: '1rem' }}>Company</th>
                <th style={{ padding: '1rem' }}>Contact</th>
                <th style={{ padding: '1rem' }}>Stage</th>
                <th style={{ padding: '1rem' }}>Value (USD)</th>
                <th style={{ padding: '1rem' }}>Last Touch</th>
              </tr>
            </thead>
            <tbody>
              {loadingLeads ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>
                    Syncing with database...
                  </td>
                </tr>
              ) : activeLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>
                    No active deals in pipeline.
                  </td>
                </tr>
              ) : (
                activeLeads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{lead.title}</td>
                    <td style={{ padding: '1rem' }}>{lead.companies?.name || '—'}</td>
                    <td style={{ padding: '1rem' }}>{lead.contacts?.name || '—'}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {lead.stage}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      ${(Number(lead.value) || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--dim)' }}>
                      {formatTimeAgo(lead.updated_at)}
                    </td>
                  </tr>
                ))
              )}
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