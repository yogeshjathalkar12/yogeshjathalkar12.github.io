import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency, relativeTime, TYPE_ICON } from '../../lib/crmHelpers';
import NewDealModal from '../../components/crm/NewDealModal';

export default function CrmOverview() {
  const [deals, setDeals] = useState<any[]>([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDeal, setShowNewDeal] = useState(false);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const [dealsRes, contactsRes, interactionsRes] = await Promise.all([
        supabase.from('deals').select('*, contacts(id, name), companies(id, name)').order('created_at', { ascending: false }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('interactions').select('*, contacts(id, name)').order('created_at', { ascending: false }).limit(5),
      ]);

      if (dealsRes.error) throw dealsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (interactionsRes.error) throw interactionsRes.error;

      setDeals(dealsRes.data || []);
      setContactsCount(contactsRes.count || 0);
      setInteractions(interactionsRes.data || []);
    } catch (error) {
      console.error('Failed to load overview:', error);
    } finally {
      setLoading(false);
    }
  }

  const openDeals = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const openValue = openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const now = new Date();
  const wonThisMonth = deals.filter(
    (d) => d.stage === 'won' && d.closed_at &&
      new Date(d.closed_at).getMonth() === now.getMonth() &&
      new Date(d.closed_at).getFullYear() === now.getFullYear()
  );
  const wonValue = wonThisMonth.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const kpiCardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '1.6rem',
    borderRadius: '6px',
  };
  const kpiLabelStyle: React.CSSProperties = {
    fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase',
  };
  const kpiValueStyle: React.CSSProperties = {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: '2.2rem', marginTop: '0.4rem',
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading overview…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.4rem' }}>
        <button
          onClick={() => setShowNewDeal(true)}
          style={{
            background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          + New Deal
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.4rem', marginBottom: '2rem' }}>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Pipeline Value</div>
          <div style={{ ...kpiValueStyle, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {formatCurrency(openValue)}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Active Deals</div>
          <div style={kpiValueStyle}>{openDeals.length}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Won This Month</div>
          <div style={kpiValueStyle}>{formatCurrency(wonValue)}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Contacts</div>
          <div style={kpiValueStyle}>{contactsCount}</div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.6rem', borderRadius: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase' }}>Recent Activity</div>
          <Link to="/crm/activity" style={{ fontSize: '0.6rem', color: 'var(--purple)', textDecoration: 'none' }}>View all →</Link>
        </div>

        {interactions.length === 0 ? (
          <div style={{ fontSize: '0.65rem', color: 'var(--dim2)', textAlign: 'center', padding: '1.5rem 0' }}>No activity logged yet</div>
        ) : (
          interactions.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: '0.9rem', padding: '0.9rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>{TYPE_ICON[i.type] || '•'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--white)' }}>
                  {i.contacts?.name || 'Unknown contact'} <span style={{ color: 'var(--dim)' }}>· {i.type}</span>
                </div>
                <div style={{ fontSize: '0.7rem', margin: '0.25rem 0' }}>{i.content}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>{relativeTime(i.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <NewDealModal open={showNewDeal} onClose={() => setShowNewDeal(false)} onCreated={fetchAll} />
    </div>
  );
}