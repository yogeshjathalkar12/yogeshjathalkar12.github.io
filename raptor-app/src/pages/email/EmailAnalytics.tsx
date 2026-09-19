import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from 'recharts';

const EMAIL_API = toolApiBase('email');
const CHANNEL_COLORS = ['#a855f7', '#3b82f6', '#22c55e', '#f97316'];
const RANGE_OPTIONS = [7, 30, 90];

const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--green)',
  warning: '#eab308',
  critical: 'var(--red)',
  not_applicable: 'var(--dim2)',
  unknown: 'var(--dim2)',
};

const CHECK_LABELS: Record<string, string> = {
  bounce_rate: 'Bounce Rate',
  complaint_rate: 'Complaint Rate',
  spf: 'SPF',
  dmarc: 'DMARC',
  dkim: 'DKIM',
  blocklist: 'Blocklist',
};

const CHECK_ORDER = ['bounce_rate', 'complaint_rate', 'spf', 'dmarc', 'dkim', 'blocklist'];

// Same pattern as CrmAnalytics.tsx — Recharts can throw on odd data shapes,
// and one bad chart shouldn't take the whole dashboard down with it.
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  rtaor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error('Chart error caught by boundary:', error);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '2rem', color: 'var(--dim)', textAlign: 'center', fontSize: '0.75rem' }}>Chart unavailable.</div>;
    }
    return this.props.children;
  }
}

export default function EmailAnalytics() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reputationChecks, setReputationChecks] = useState<any[]>([]);
  const [runningCheck, setRunningCheck] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchOverview();
      fetchReputation();
    }
  }, [accountId, days]);

  async function fetchReputation() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch(`${EMAIL_API}/accounts/${accountId}/reputation`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) return;
      const body = await resp.json();
      setReputationChecks(body.checks || []);
    } catch (err) {
      console.error('Failed to load reputation status:', err);
    }
  }

  async function handleRunCheck() {
    setRunningCheck(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/accounts/${accountId}/reputation/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) throw new Error(`Could not run the check (${resp.status}).`);
      await fetchReputation();
    } catch (err: any) {
      console.error('Failed to run reputation check:', err);
      setError(err.message || 'Could not run the check.');
    } finally {
      setRunningCheck(false);
    }
  }

  async function fetchAccounts() {
    const { data } = await supabase.from('email_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchOverview() {
    setLoadingOverview(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/analytics/overview?account_id=${accountId}&days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Could not load analytics (${resp.status}).`);
      }
      setOverview(await resp.json());
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setError(err.message || 'Could not load analytics.');
    } finally {
      setLoadingOverview(false);
    }
  }

  const kpiCardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem',
  };
  const kpiLabelStyle: React.CSSProperties = {
    fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase',
  };
  const kpiValueStyle: React.CSSProperties = {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: '2rem', marginTop: '0.4rem',
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;

  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a sending account first.</div>;
  }

  const channelData = overview
    ? Object.entries(overview.channel_breakdown)
        .map(([name, value]) => ({ name, value: value as number }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem', alignItems: 'center' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                background: days === d ? 'var(--grad)' : 'transparent',
                color: days === d ? '#fff' : 'var(--dim)',
                border: '1px solid var(--border)', borderRadius: '4px', padding: '0.5rem 0.9rem',
                cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', textTransform: 'uppercase',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...kpiCardStyle, marginBottom: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--white)' }}>Domain Health</div>
          <button
            onClick={handleRunCheck}
            disabled={runningCheck}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
          >
            {runningCheck ? 'Checking…' : 'Run check now'}
          </button>
        </div>
        {reputationChecks.length === 0 ? (
          <div style={{ fontSize: '0.65rem', color: 'var(--dim2)' }}>No checks run yet — click "Run check now", or wait for the next scheduled check.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem' }}>
            {CHECK_ORDER.map((checkType) => {
              const check = reputationChecks.find((c) => c.check_type === checkType);
              if (!check) return null;
              return (
                <div key={checkType} title={check.detail} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.7rem 0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[check.status] || 'var(--dim2)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.62rem', color: 'var(--white)' }}>{CHECK_LABELS[checkType] || checkType}</span>
                  </div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--dim)', lineHeight: 1.4 }}>{check.detail}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '0.8rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.7rem', marginBottom: '1.4rem' }}>
          {error}
        </div>
      )}

      {loadingOverview || !overview ? (
        <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Loading analytics…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.2rem' }}>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Sent ({overview.range_days}d)</div>
              <div style={{ ...kpiValueStyle, color: 'var(--white)' }}>{overview.totals.sent}</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Open Rate</div>
              <div style={{ ...kpiValueStyle, color: 'var(--purple)' }}>{overview.rates.open_rate}%</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>{overview.totals.opened} opens</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Click Rate</div>
              <div style={{ ...kpiValueStyle, color: '#3b82f6' }}>{overview.rates.click_rate}%</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>{overview.totals.clicked} clicks</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Bounce Rate</div>
              <div style={{ ...kpiValueStyle, color: overview.rates.bounce_rate > 5 ? 'var(--red)' : 'var(--white)' }}>{overview.rates.bounce_rate}%</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>{overview.totals.bounced} bounces</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Unsubscribe Rate</div>
              <div style={{ ...kpiValueStyle, color: 'var(--white)' }}>{overview.rates.unsubscribe_rate}%</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>{overview.totals.unsubscribed} unsubscribes</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.4rem' }}>
            <div style={kpiCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '1rem' }}>Volume &amp; Engagement Over Time</div>
              <div style={{ width: '100%', height: 260 }}>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overview.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--dim)" fontSize={10} />
                      <YAxis stroke="var(--dim)" fontSize={10} />
                      <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                      <Line type="monotone" dataKey="sent" stroke="var(--dim)" dot={false} />
                      <Line type="monotone" dataKey="opened" stroke="#a855f7" dot={false} />
                      <Line type="monotone" dataKey="clicked" stroke="#3b82f6" dot={false} />
                      <Line type="monotone" dataKey="bounced" stroke="#ef4444" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '1rem' }}>Volume by Channel</div>
              <div style={{ width: '100%', height: 260 }}>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelData.length > 0 ? channelData : [{ name: 'NO DATA', value: 1 }]}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value"
                      >
                        {channelData.map((_, i) => (
                          <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '1rem' }}>By Campaign</div>
            {overview.by_campaign.length === 0 ? (
              <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No campaigns in this range.</div>
            ) : (
              <div style={{ width: '100%', height: Math.max(200, overview.by_campaign.length * 40) }}>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.by_campaign} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" stroke="var(--dim)" fontSize={10} />
                      <YAxis type="category" dataKey="name" stroke="var(--dim)" fontSize={10} width={140} />
                      <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                      <Bar dataKey="sent" fill="var(--dim)" />
                      <Bar dataKey="opened" fill="#a855f7" />
                      <Bar dataKey="clicked" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}