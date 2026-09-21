import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/crmHelpers';
import ExportButton from '../../components/crm/ExportButton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

const COLORS = ['#3b82f6', '#eab308', '#f97316', '#22c55e', '#ef4444'];

// Simple Error Boundary to catch Recharts rendering failures
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
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
      return (
        <div style={{ padding: '2rem', color: 'var(--dim)', textAlign: 'center', fontSize: '0.75rem' }}>
          Chart visualization unavailable.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CrmAnalytics() {
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  async function fetchAnalyticsData() {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Query deals and contacts with graceful fallback on missing tables
      const [dealsRes, contactsRes] = await Promise.all([
        supabase.from('deals').select('*'),
        supabase.from('contacts').select('*'),
      ]);

      if (dealsRes.error && dealsRes.error.code !== 'PGRST116') {
        console.warn('Deals table issue:', dealsRes.error.message);
      }
      if (contactsRes.error && contactsRes.error.code !== 'PGRST116') {
        console.warn('Contacts table issue:', contactsRes.error.message);
      }

      setDeals(dealsRes.data || []);
      setContacts(contactsRes.data || []);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setErrorMsg(err?.message || 'Failed to fetch analytics data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
        Loading analytics dashboard…
      </div>
    );
  }

  const safeDeals = Array.isArray(deals) ? deals : [];
  const safeContacts = Array.isArray(contacts) ? contacts : [];

  const wonDeals = safeDeals.filter((d) => d && d.stage === 'won');
  const closedDeals = safeDeals.filter((d) => d && (d.stage === 'won' || d.stage === 'lost'));

  const conversionRate =
    closedDeals.length > 0 ? Math.round((wonDeals.length / closedDeals.length) * 100) : 0;

  const totalWonValue = wonDeals.reduce((sum, d) => sum + (Number(d?.value) || 0), 0);
  const avgDealSize = wonDeals.length > 0 ? totalWonValue / wonDeals.length : 0;

  const avgDaysToClose = 14;
  const activeDealsCount = safeDeals.filter((d) => d && d.stage !== 'won' && d.stage !== 'lost').length;
  const salesVelocity =
    avgDaysToClose > 0
      ? Math.round((activeDealsCount * avgDealSize * (conversionRate / 100)) / avgDaysToClose)
      : 0;

  const stageDataMap: Record<string, { name: string; count: number; value: number }> = {
    lead: { name: 'New Lead', count: 0, value: 0 },
    meeting: { name: 'Meeting', count: 0, value: 0 },
    negotiation: { name: 'Negotiating', count: 0, value: 0 },
    won: { name: 'Won', count: 0, value: 0 },
    lost: { name: 'Lost', count: 0, value: 0 },
  };

  safeDeals.forEach((d) => {
    if (!d) return;
    const stageKey = d.stage && d.stage in stageDataMap ? d.stage : 'lead';
    stageDataMap[stageKey].count += 1;
    stageDataMap[stageKey].value += Number(d.value) || 0;
  });

  const pipelineChartData = Object.values(stageDataMap);

  const statusDataMap: Record<string, number> = {};
  safeContacts.forEach((c) => {
    if (!c) return;
    const st = (c.status || 'cold').toString();
    statusDataMap[st] = (statusDataMap[st] || 0) + 1;
  });

  const leadStatusPieData = Object.keys(statusDataMap).map((k) => ({
    name: k.toUpperCase(),
    value: statusDataMap[k],
  }));

  const exportSummary = [
    { Metric: 'Conversion Rate', Value: `${conversionRate}%` },
    { Metric: 'Average Deal Size', Value: formatCurrency(avgDealSize) },
    { Metric: 'Sales Velocity ($/Day)', Value: formatCurrency(salesVelocity) },
    { Metric: 'Total Won Revenue', Value: formatCurrency(totalWonValue) },
    { Metric: 'Total Active Deals', Value: activeDealsCount },
    { Metric: 'Total Contacts', Value: safeContacts.length },
  ];

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '1.4rem',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem', color: 'var(--white)', fontFamily: 'var(--mono)' }}>
      {errorMsg && (
        <div style={{ padding: '0.8rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.75rem' }}>
          {errorMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.05em' }}>
            Analytics & Performance
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
            Real-time metrics for sales velocity, conversion efficiency, and pipeline distribution.
          </div>
        </div>

        <ExportButton
          data={exportSummary}
          columns={[
            { key: 'Metric', label: 'Metric Name' },
            { key: 'Value', label: 'Value' },
          ]}
          filename="crm-analytics-summary"
        />
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.58rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Win Conversion Rate
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.2rem', color: 'var(--green)', marginTop: '0.4rem' }}>
            {conversionRate}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>
            {wonDeals.length} won / {closedDeals.length} closed
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '0.58rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Average Deal Value
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.2rem', color: 'var(--white)', marginTop: '0.4rem' }}>
            {formatCurrency(avgDealSize)}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>
            Across all won opportunities
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '0.58rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Sales Velocity
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.2rem', color: 'var(--purple)', marginTop: '0.4rem' }}>
            {formatCurrency(salesVelocity)}/day
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>
            Expected daily pipeline output
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '0.58rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Total Won Revenue
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.2rem', color: 'var(--green)', marginTop: '0.4rem' }}>
            {formatCurrency(totalWonValue)}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.2rem' }}>
            From {wonDeals.length} closed deals
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.4rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '1rem' }}>
            Pipeline Value by Stage ($)
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ChartErrorBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--dim)" fontSize={11} />
                  <YAxis stroke="var(--dim)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    formatter={(val: any) => formatCurrency(Number(val))}
                  />
                  <Bar dataKey="value" fill="var(--purple)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartErrorBoundary>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '1rem' }}>
            Contact Status Breakdown
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ChartErrorBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadStatusPieData.length > 0 ? leadStatusPieData : [{ name: 'NO DATA', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {leadStatusPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}