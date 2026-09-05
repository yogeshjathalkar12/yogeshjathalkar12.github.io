import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime } from '../../lib/crmHelpers';
import NewContactModal from '../../components/crm/NewContactModal';
import ContactPanel from '../../components/crm/ContactPanel';
import BulkImportModal from '../../components/crm/BulkImportModal';
import ExportButton from '../../components/crm/ExportButton';
import { CONTACTS_IMPORT_SCHEMA } from '../../lib/importSchema';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  hot: { bg: 'rgba(239,68,68,0.1)', fg: 'var(--red)' },
  cold: { bg: 'rgba(113,113,122,0.1)', fg: 'var(--dim)' },
  active: { bg: 'rgba(34,197,94,0.1)', fg: 'var(--green)' },
};

export default function CrmContacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewContact, setShowNewContact] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeContact, setActiveContact] = useState<any | null>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-contacts-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const [contactsRes, dealsRes, interactionsRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*, companies(id, name)')
          .order('last_interaction_at', { ascending: false, nullsFirst: false }),
        supabase.from('deals').select('id, contact_id, stage'),
        supabase
          .from('interactions')
          .select('*, contacts(id, name)')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (interactionsRes.error) throw interactionsRes.error;

      setContacts(contactsRes.data || []);
      setDeals(dealsRes.data || []);
      setInteractions(interactionsRes.data || []);

      setActiveContact((prev: any) =>
        prev ? (contactsRes.data || []).find((c: any) => c.id === prev.id) || null : null
      );
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = contacts.filter(
    (c) =>
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.companies?.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
  );

  function activeDealCount(contactId: string) {
    return deals.filter((d) => d.contact_id === contactId && d.stage !== 'won' && d.stage !== 'lost').length;
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading contacts…</div>;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.4rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts, emails, or companies…"
          style={{
            flex: 1,
            maxWidth: 320,
            padding: '0.6rem 0.9rem',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--white)',
            fontFamily: 'var(--mono)',
            fontSize: '0.7rem',
            borderRadius: '4px',
          }}
        />
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <ExportButton
            data={contacts}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'status', label: 'Status' },
            ]}
            filename="contacts"
          />
          <button
            onClick={() => setShowImport(true)}
            style={{
              background: 'transparent',
              color: 'var(--dim)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Bulk Import
          </button>
          <button
            onClick={() => setShowNewContact(true)}
            style={{
              background: 'var(--grad)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            + New Contact
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontFamily: 'var(--mono)',
            fontSize: '0.75rem',
          }}
        >
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.9rem 1rem' }}>Name</th>
              <th style={{ padding: '0.9rem 1rem' }}>Company</th>
              <th style={{ padding: '0.9rem 1rem' }}>Last Touch</th>
              <th style={{ padding: '0.9rem 1rem' }}>Status</th>
              <th style={{ padding: '0.9rem 1rem' }}>Active Deals</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>
                  {contacts.length === 0 ? 'No contacts yet.' : 'No contacts match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const colors = STATUS_COLORS[c.status || 'cold'] || STATUS_COLORS.cold;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setActiveContact(c)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{c.name}</td>
                    <td style={{ padding: '1rem', color: 'var(--dim)' }}>{c.companies?.name || '—'}</td>
                    <td style={{ padding: '1rem', color: 'var(--dim)' }}>{relativeTime(c.last_interaction_at)}</td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          background: colors.bg,
                          color: colors.fg,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          fontSize: '0.6rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {c.status || 'cold'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>{activeDealCount(c.id)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <NewContactModal open={showNewContact} onClose={() => setShowNewContact(false)} onCreated={fetchAll} />
      <BulkImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        tableName="contacts"
        schema={CONTACTS_IMPORT_SCHEMA}
        onImported={fetchAll}
      />
      <ContactPanel
        contact={activeContact}
        interactions={interactions}
        onClose={() => setActiveContact(null)}
        onChanged={fetchAll}
      />
    </div>
  );
}