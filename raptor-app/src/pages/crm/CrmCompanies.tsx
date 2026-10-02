import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/crmHelpers';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../../components/crm/Modal';
import DuplicatesModal from '../../components/crm/DuplicatesModal';
import OwnerOnly from '../../components/OwnerOnly';

// Real CRM companies (Supabase `companies` table) - this app never had a
// dedicated page for them before (they only ever showed up as a name-join
// on contacts/deals); this mirrors the desktop app's own CrmCompanies.js,
// adapted to this app's table+modal convention (see CrmContacts.tsx)
// instead of desktop's inline two-column grid.
export default function CrmCompanies() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, any[]>>({});
  const [dealsByCompany, setDealsByCompany] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [activeCompany, setActiveCompany] = useState<any | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('crm-companies-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    try {
      const [companiesRes, contactsRes, dealsRes] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: false }),
        supabase.from('contacts').select('id, name, company_id'),
        supabase.from('deals').select('id, title, value, company_id'),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      setCompanies(companiesRes.data || []);
      setActiveCompany((prev: any) => (prev ? (companiesRes.data || []).find((c: any) => c.id === prev.id) || null : prev));

      const byContact: Record<string, any[]> = {};
      (contactsRes.data || []).forEach((c: any) => { if (c.company_id) (byContact[c.company_id] = byContact[c.company_id] || []).push(c); });
      setContactsByCompany(byContact);

      const byDeal: Record<string, any[]> = {};
      (dealsRes.data || []).forEach((d: any) => { if (d.company_id) (byDeal[d.company_id] = byDeal[d.company_id] || []).push(d); });
      setDealsByCompany(byDeal);
    } catch (error) {
      console.error('Failed to load companies:', error);
    } finally {
      setLoading(false);
    }
  }

  // GlobalSearch.tsx navigates here with ?open=<id> - once the real fetch
  // resolves, open that company and drop the param so a refresh/back
  // doesn't reopen it.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || companies.length === 0) return;
    const match = companies.find((c) => c.id === openId);
    if (match) setActiveCompany(match);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading companies…</div>;
  }

  const q = search.trim().toLowerCase();
  const filtered = companies.filter((c) => !q || (c.name || '').toLowerCase().includes(q));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          style={{ flex: 1, maxWidth: 320, padding: '0.6rem 0.9rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.7rem', borderRadius: '4px' }}
        />
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <OwnerOnly permission="delete">
            <button
              onClick={() => setShowDuplicates(true)}
              style={{ background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              Find Duplicates
            </button>
          </OwnerOnly>
          <OwnerOnly permission="create">
            <button
              onClick={() => setShowNew(true)}
              style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              + New Company
            </button>
          </OwnerOnly>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.9rem 1rem' }}>Name</th>
              <th style={{ padding: '0.9rem 1rem' }}>Website</th>
              <th style={{ padding: '0.9rem 1rem' }}>Contacts</th>
              <th style={{ padding: '0.9rem 1rem' }}>Deals</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>{companies.length === 0 ? 'No companies yet.' : 'No companies match your search.'}</td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} onClick={() => setActiveCompany(c)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{c.name}</td>
                  <td style={{ padding: '1rem', color: 'var(--dim)' }}>{c.website_url ? c.website_url.replace(/^https?:\/\//, '') : '—'}</td>
                  <td style={{ padding: '1rem' }}>{(contactsByCompany[c.id] || []).length}</td>
                  <td style={{ padding: '1rem' }}>{(dealsByCompany[c.id] || []).length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewCompanyModal open={showNew} onClose={() => setShowNew(false)} onCreated={fetchAll} />
      <CompanyDetailModal
        company={activeCompany}
        contacts={activeCompany ? contactsByCompany[activeCompany.id] || [] : []}
        deals={activeCompany ? dealsByCompany[activeCompany.id] || [] : []}
        onClose={() => setActiveCompany(null)}
        onChanged={fetchAll}
      />
      <DuplicatesModal kind="company" open={showDuplicates} onClose={() => setShowDuplicates(false)} onMerged={fetchAll} />
    </div>
  );
}

function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setName(''); setWebsiteUrl(''); setError(null); } }, [open]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('companies').insert({ name: trimmed, website_url: websiteUrl.trim() || null });
      if (insertErr) throw insertErr;
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not add that company.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Company">
      <form onSubmit={handleCreate}>
        <label style={fieldLabelStyle}>Name</label>
        <input style={fieldInputStyle} value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Acme Corp" />
        <label style={fieldLabelStyle}>Website (optional)</label>
        <input style={fieldInputStyle} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://theircompany.com" />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.7rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CompanyDetailModal({ company, contacts, deals, onClose, onChanged }: { company: any | null; contacts: any[]; deals: any[]; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setError(null);
    if (company) { setEditName(company.name || ''); setEditWebsite(company.website_url || ''); }
  }, [company?.id]);

  if (!company) return null;

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.from('companies').update({ name: trimmed, website_url: editWebsite.trim() || null }).eq('id', company.id);
      if (updateErr) throw updateErr;
      onChanged();
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Could not save those changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const linked = contacts.length + deals.length;
    const msg = linked > 0
      ? `${company.name} has ${linked} linked contact(s)/deal(s). Delete anyway? They'll keep existing but lose their company link.`
      : `Delete ${company.name}?`;
    if (!confirm(msg)) return;
    setSaving(true);
    setError(null);
    try {
      const { error: deleteErr } = await supabase.from('companies').delete().eq('id', company.id);
      if (deleteErr) throw deleteErr;
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not delete this company.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!company} onClose={onClose} title={editing ? 'Edit Company' : company.name}>
      {editing ? (
        <form onSubmit={handleSaveEdit}>
          <label style={fieldLabelStyle}>Name</label>
          <input style={fieldInputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <label style={fieldLabelStyle}>Website</label>
          <input style={fieldInputStyle} value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} placeholder="https://theircompany.com" />
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
            {company.website_url || '— no website on file'} · added {new Date(company.created_at).toLocaleDateString()}
          </div>

          <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1rem 0 0.5rem' }}>Contacts ({contacts.length})</div>
          {contacts.length === 0 ? (
            <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginBottom: '1rem' }}>No contacts at this company.</div>
          ) : contacts.map((c) => (
            <div key={c.id} style={{ fontSize: '0.7rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>{c.name}</div>
          ))}

          <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1rem 0 0.5rem' }}>Deals ({deals.length})</div>
          {deals.length === 0 ? (
            <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginBottom: '1rem' }}>No deals for this company.</div>
          ) : deals.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span>{d.title}</span><span style={{ color: 'var(--purple)' }}>{formatCurrency(d.value)}</span>
            </div>
          ))}

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', margin: '1rem 0' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.2rem' }}>
            <OwnerOnly permission="edit"><button type="button" style={ghostBtnStyle} onClick={() => setEditing(true)}>Edit</button></OwnerOnly>
            <OwnerOnly permission="delete"><button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDelete} disabled={saving}>Delete</button></OwnerOnly>
          </div>
        </>
      )}
    </Modal>
  );
}
