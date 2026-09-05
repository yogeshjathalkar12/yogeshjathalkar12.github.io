import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime } from '../../lib/crmHelpers';
import NewTicketModal from '../../components/crm/NewTicketModal';
import BulkImportModal from '../../components/crm/BulkImportModal';
import ExportButton from '../../components/crm/ExportButton';
import { TICKETS_IMPORT_SCHEMA } from '../../lib/ticketImportSchema';

const PRIORITY_BADGES: Record<string, { bg: string; fg: string }> = {
  low: { bg: 'rgba(113,113,122,0.1)', fg: 'var(--dim)' },
  medium: { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6' },
  high: { bg: 'rgba(249,115,22,0.1)', fg: '#f97316' },
  urgent: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--red)' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--red)',
  in_progress: '#eab308',
  resolved: 'var(--green)',
  closed: 'var(--dim)',
};

export default function CrmTickets() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-tickets-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const [ticketsRes, contactsRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('*, contacts(id, name, companies(id, name))')
          .order('created_at', { ascending: false }),
        supabase.from('contacts').select('id, name, companies(id, name)').order('name', { ascending: true }),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (contactsRes.error) throw contactsRes.error;

      setTickets(ticketsRes.data || []);
      setContacts(contactsRes.data || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(ticketId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (error) throw error;
      fetchAll();
    } catch (err) {
      console.error('Failed to update ticket status:', err);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (!q) return true;
    return (
      (t.title || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.contacts?.name || '').toLowerCase().includes(q)
    );
  });

  const exportRows = tickets.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    category: t.category,
    contact: t.contacts?.name || '',
    created_at: t.created_at,
  }));

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading support tickets…</div>;
  }

  return (
    <div>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets or contacts…"
          style={{
            flex: 1, minWidth: 220, maxWidth: 320, padding: '0.6rem 0.9rem', background: 'var(--surface2)',
            border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.7rem', borderRadius: '4px',
          }}
        />

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: 'var(--surface2)', color: 'var(--white)', border: '1px solid var(--border)',
              padding: '0.55rem 0.8rem', borderRadius: '4px', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <ExportButton
            data={exportRows}
            columns={[
              { key: 'title', label: 'Subject' },
              { key: 'status', label: 'Status' },
              { key: 'priority', label: 'Priority' },
              { key: 'category', label: 'Category' },
              { key: 'contact', label: 'Contact' },
            ]}
            filename="support-tickets"
          />

          <button
            onClick={() => setShowImportModal(true)}
            style={{
              background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem',
              borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          >
            Bulk Import
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            style={{
              background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
              borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          >
            + New Ticket
          </button>
        </div>
      </div>

      {/* Tickets Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.9rem 1rem' }}>Subject / Issue</th>
              <th style={{ padding: '0.9rem 1rem' }}>Contact</th>
              <th style={{ padding: '0.9rem 1rem' }}>Priority</th>
              <th style={{ padding: '0.9rem 1rem' }}>Category</th>
              <th style={{ padding: '0.9rem 1rem' }}>Status</th>
              <th style={{ padding: '0.9rem 1rem' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>
                  {tickets.length === 0 ? 'No support tickets logged yet.' : 'No tickets match your filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const priorityBadge = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.low;
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--white)' }}>{t.title}</div>
                      {t.description && <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginTop: '0.2rem' }}>{t.description}</div>}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--dim)' }}>
                      {t.contacts?.name ? `${t.contacts.name}${t.contacts.companies?.name ? ` (${t.contacts.companies.name})` : ''}` : '—'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          background: priorityBadge.bg, color: priorityBadge.fg, padding: '0.2rem 0.6rem',
                          borderRadius: '12px', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--dim)', textTransform: 'capitalize' }}>{t.category || 'general'}</td>
                    <td style={{ padding: '1rem' }}>
                      <select
                        value={t.status}
                        onChange={(e) => updateStatus(t.id, e.target.value)}
                        style={{
                          background: 'var(--surface2)', color: STATUS_COLORS[t.status] || 'var(--white)',
                          border: '1px solid var(--border)', padding: '0.3rem 0.5rem', borderRadius: '4px',
                          fontFamily: 'var(--mono)', fontSize: '0.65rem', textTransform: 'uppercase',
                        }}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--dim2)' }}>{relativeTime(t.created_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <NewTicketModal open={showNewModal} contacts={contacts} onClose={() => setShowNewModal(false)} onCreated={fetchAll} />
      <BulkImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        tableName="tickets"
        schema={TICKETS_IMPORT_SCHEMA}
        onImported={fetchAll}
      />
    </div>
  );
}