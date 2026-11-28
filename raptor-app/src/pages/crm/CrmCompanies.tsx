import AssigneeSelect from '../../components/crm/AssigneeSelect';
import { useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/crmHelpers';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../../components/crm/Modal';
import DuplicatesModal from '../../components/crm/DuplicatesModal';
import CustomFieldsSection, { CustomFieldsInputs } from '../../components/crm/CustomFieldsSection';
import ViewTable from '../../components/crm/ViewTable';
import type { UiColumn } from '../../components/crm/ViewTable';
import { customFieldColumns, customSearchText } from '../../lib/viewColumns';
import { loadFieldDefs } from '../../lib/customFields';
import type { CustomFieldDef } from '../../lib/customFields';
import { useAuth } from '../../hooks/AuthContext';
import { COMPANY_FIELDS, blankCompanyForm, cleanCustomValues, companyToForm, filledCompanyDetails, formToCompany } from '../../lib/companyFields';
import type { CompanyForm } from '../../lib/companyFields';
import ImportWizardModal from '../../components/crm/ImportWizardModal';
import ImportHistoryModal from '../../components/crm/ImportHistoryModal';
import OwnerOnly from '../../components/OwnerOnly';
import ExportButton from '../../components/crm/ExportButton';
import { exportRecords } from '../../lib/tableView';
import RecordHistory from '../../components/crm/RecordHistory';
import ActivityTimeline from '../../components/crm/ActivityTimeline';
import CompanySignals from '../../components/crm/CompanySignals';
import { selectAll } from '../../lib/selectAll';
import { useLargeList, useListSize } from '../../hooks/useLargeList';
import { canSort, customServerField, type ServerField } from '../../lib/largeList';
import { useDirectory } from '../../hooks/useDirectory';
import { coalesce } from '../../lib/coalesce';
import { moveToBin } from '../../lib/bulk';
import { useColumn } from '../../hooks/useColumn';
import BulkBar from '../../components/crm/BulkBar';
import { useOrg } from '../../hooks/OrgContext';
import TagsEditor from '../../components/crm/TagsEditor';
import { DesktopRecordTools, desktopColumns } from '../../lib/desktop';

// Real CRM companies (Supabase `companies` table) - this app never had a
// dedicated page for them before (they only ever showed up as a name-join
// on contacts/deals); this mirrors the desktop app's own CrmCompanies.js,
// adapted to this app's table+modal convention (see CrmContacts.tsx)
// instead of desktop's inline two-column grid.
// records grouped under the company they belong to
function byCompany(rows: any[]): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const row of rows) if (row.company_id) (out[row.company_id] = out[row.company_id] || []).push(row);
  return out;
}

export default function CrmCompanies() {
  const tagColumn = useColumn('companies', 'tags');
  const ownerColumn = useColumn('companies', 'assignee_id');
  const { can } = useOrg();
  const [bulkNote, setBulkNote] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, any[]>>({});
  const [dealsByCompany, setDealsByCompany] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [activeCompany, setActiveCompany] = useState<any | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [importLabels, setImportLabels] = useState<Record<string, string>>({});
  const [viewed, setViewed] = useState<{ rows: any[]; cols: UiColumn<any>[] }>({ rows: [], cols: [] });
  const { user } = useAuth();
  // A very long list is not downloaded: the database searches, filters, sorts and sends one page.
  const size = useListSize('companies');
  const sizeNow = useRef(size);
  sizeNow.current = size;
  const { entries: people } = useDirectory();
  const reloadPage = useRef<() => void>(() => {});

  useEffect(() => {
    if (size === 'counting') return;
    fetchAll();
    const reload = coalesce(fetchAll);
    const channel = supabase
      .channel('crm-companies-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, reload)
      .subscribe();
    return () => { reload.cancel(); supabase.removeChannel(channel); };
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const big = sizeNow.current === 'large';
    if (big) reloadPage.current();
    const none = Promise.resolve({ data: [] as any[], error: null });
    try {
      const [companiesRes, contactsRes, dealsRes, fieldDefs, importsRes] = await Promise.all([
        big ? none : selectAll(() => supabase.from('companies').select('*').order('created_at', { ascending: false })),
        big ? none : selectAll(() => supabase.from('contacts').select('id, name, company_id')),
        big ? none : selectAll(() => supabase.from('deals').select('id, title, value, company_id')),
        loadFieldDefs('company').catch(() => [] as CustomFieldDef[]),
        Promise.resolve(supabase.from('crm_imports').select('id, source_name, file_name, started_at')).catch(() => ({ data: [] as any[] })),   // the import log may not exist yet
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      setDefs(fieldDefs);
      const labels: Record<string, string> = {};
      for (const i of (importsRes as any).data || []) labels[i.id] = `${i.source_name || i.file_name || 'Import'} · ${String(i.started_at || '').slice(0, 10)}`;
      setImportLabels(labels);
      if (big) return;                       // its rows, and their contacts and deals, come a page at a time, below
      setCompanies(companiesRes.data || []);
      setActiveCompany((prev: any) => (prev ? (companiesRes.data || []).find((c: any) => c.id === prev.id) || null : prev));

      setContactsByCompany(byCompany(contactsRes.data || []));
      setDealsByCompany(byCompany(dealsRes.data || []));
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
    const big = size === 'large';
    if (!openId || size === 'counting' || (!big && companies.length === 0)) return;
    const done = (match: any) => {
      if (match) setActiveCompany(match);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    };
    if (!big) done(companies.find((c) => c.id === openId));
    else Promise.resolve(supabase.from('companies').select('*').eq('id', openId).maybeSingle()).then(({ data }: any) => done(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, size]);

  const serverFields: Record<string, ServerField> = useMemo(() => {
    const out: Record<string, ServerField> = {
      name: { type: 'text', column: 'name' },
      website: { type: 'text', column: 'website_url' },
      ...(ownerColumn ? { owner: { type: 'lookup' as const, column: 'assignee_id' } } : {}),
      phone: { type: 'text', column: 'phone' },
      email: { type: 'text', column: 'email' },
      city: { type: 'text', column: 'city' },
      industry: { type: 'text', column: 'industry' },
      address: { type: 'text', column: 'address' },
      description: { type: 'text', column: 'description' },
      imported: { type: 'lookup', column: 'import_batch_id' },
      created: { type: 'date', column: 'created_at' },
    };
    for (const def of defs) { const field = customServerField(def); if (field) out[`cf:${def.id}`] = field; }
    return out;
  }, [defs, ownerColumn]);

  const big = useLargeList({
    enabled: size === 'large',
    table: 'companies',
    select: '*',
    fields: serverFields,
    defaultOrder: { column: 'created_at', ascending: false },
    search,
    searchColumns: ['name', 'website_url', 'email', 'phone', 'city', 'industry', 'address'],
    lookup: (column, text) => {
      const wanted = text.toLowerCase();
      if (column === 'owner') return people.filter((p) => shortName(p.email).toLowerCase().includes(wanted)).map((p) => p.user_id);
      return Object.entries(importLabels).filter(([, label]) => label === text).map(([id]) => id);
    },
  });
  reloadPage.current = big.reload;
  const openId = activeCompany?.id as string | undefined;
  useEffect(() => {
    if (size !== 'large') return;
    setCompanies(big.rows);
    setActiveCompany((prev: any) => (prev ? big.rows.find((c: any) => c.id === prev.id) || prev : prev));
  }, [big.rows, size]);
  // the contacts and deals of the companies on this page (and of the one that is open), for the counts and the company window
  useEffect(() => {
    if (size !== 'large') return;
    const ids = [...new Set([...big.rows.map((c: any) => c.id), ...(openId ? [openId] : [])])];
    if (!ids.length) { setContactsByCompany({}); setDealsByCompany({}); return; }
    let alive = true;
    Promise.all([
      selectAll(() => supabase.from('contacts').select('id, name, company_id').in('company_id', ids)),
      selectAll(() => supabase.from('deals').select('id, title, value, company_id').in('company_id', ids)),
    ]).then(([contactsRes, dealsRes]) => {
      if (!alive || contactsRes.error || dealsRes.error) return;
      setContactsByCompany(byCompany(contactsRes.data || []));
      setDealsByCompany(byCompany(dealsRes.data || []));
    });
    return () => { alive = false; };
  }, [big.rows, openId, size]);

  const ownerNames = useMemberLabels(companies.map((c) => c.assignee_id));

  const columns: UiColumn<any>[] = useMemo(() => {
    const importedOptions = [...new Set(Object.values(importLabels))];
    const built: UiColumn<any>[] = [
      { id: 'name', label: 'Name', kind: 'text', value: (c) => c.name, locked: true, bold: true },
      { id: 'website', label: 'Website', kind: 'text', value: (c) => (c.website_url ? c.website_url.replace(/^https?:\/\//, '') : null), exportValue: (c) => c.website_url, defaultVisible: true, dim: true },
      { id: 'contacts', label: 'Contacts', kind: 'number', value: (c) => (contactsByCompany[c.id] || []).length, defaultVisible: true },
      { id: 'deals', label: 'Deals', kind: 'number', value: (c) => (dealsByCompany[c.id] || []).length, defaultVisible: true },
      ...(ownerColumn ? [{ id: 'owner', label: 'Owner', kind: 'text' as const, value: (c: any) => (c.assignee_id ? shortName(ownerNames[c.assignee_id]) : ''), dim: true }] : []),
      ...(tagColumn ? [{ id: 'tags', label: 'Tags', kind: 'text' as const, value: (c: any) => (c.tags || []).join(', ') }] : []),
      { id: 'phone', label: 'Phone', kind: 'text', value: (c) => c.phone, dim: true },
      { id: 'email', label: 'Email', kind: 'text', value: (c) => c.email, dim: true },
      { id: 'city', label: 'City / region', kind: 'text', value: (c) => c.city, dim: true },
      { id: 'industry', label: 'Industry', kind: 'text', value: (c) => c.industry, dim: true },
      { id: 'address', label: 'Address', kind: 'text', value: (c) => c.address, dim: true },
      { id: 'description', label: 'Description', kind: 'text', value: (c) => c.description, dim: true },
      { id: 'imported', label: 'Imported from', kind: 'select', value: (c) => (c.import_batch_id ? importLabels[c.import_batch_id] || 'an import' : null), options: importedOptions, dim: true },
      { id: 'created', label: 'Added', kind: 'date', value: (c) => c.created_at, dim: true },
    ];
    return [...built, ...customFieldColumns(defs, (c: any) => c.custom_fields, companies), ...desktopColumns('company')];
  }, [defs, importLabels, contactsByCompany, dealsByCompany, companies, ownerColumn, ownerNames, tagColumn]);

  // the rows exactly as the person sees them (search, filters, sort) with every column, also the hidden ones and their own fields
  const exportFile = useMemo(() => exportRecords(viewed.rows, viewed.cols), [viewed]);
  // a very large list: everything that matches is fetched when Export is pressed
  const exportAll = async () => {
    const [all, people_, deals_] = await Promise.all([
      big.everything(),
      selectAll(() => supabase.from('contacts').select('id, company_id')),
      selectAll(() => supabase.from('deals').select('id, company_id')),
    ]);
    if (people_.error || deals_.error) throw people_.error || deals_.error;
    const contactCount = byCompany(people_.data || []), dealCount = byCompany(deals_.data || []);
    const cols = columns.map((col) => (col.id === 'contacts' ? { ...col, value: (r: any) => (contactCount[r.id] || []).length }
      : col.id === 'deals' ? { ...col, value: (r: any) => (dealCount[r.id] || []).length }
      : col.id === 'owner' ? { ...col, value: (r: any) => (r.assignee_id ? shortName(people.find((p) => p.user_id === r.assignee_id)?.email) : '') } : col));
    return exportRecords(all, cols);
  };

  if (loading || size === 'counting') {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading companies…</div>;
  }

  const q = search.trim().toLowerCase();
  const filtered = companies.filter((c) => size === 'large' || !q || [c.name, c.website_url, c.email, c.phone, c.city, c.industry, c.address, ...customSearchText(c.custom_fields)].some((v) => (v || '').toLowerCase().includes(q)));

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
          <ExportButton data={exportFile.data} columns={exportFile.columns} filename="companies" label="Export CSV (all columns)" load={size === 'large' ? exportAll : undefined} />
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
              onClick={() => setShowImport(true)}
              style={{ background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              Import
            </button>
          </OwnerOnly>
          <button
            onClick={() => setShowImportHistory(true)}
            style={{ background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Import History
          </button>
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

      {bulkNote && <div role="status" style={{ fontSize: '0.65rem', color: 'var(--green)', marginBottom: 8 }}>{bulkNote}</div>}
      {size === 'large' && <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: 6 }}>A very large list: it is shown a page at a time.</div>}
      {size === 'large' && big.error && <div role="alert" style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: 8 }}>{big.error}</div>}
      <ViewTable
        columns={columns}
        rows={filtered}
        storageKey={`companies:${user?.id || 'anon'}`}
        rowKey={(c) => c.id}
        onRowClick={(c) => setActiveCompany(c)}
        emptyText={companies.length === 0 && !search.trim() ? 'No companies yet.' : 'No companies match your search.'}
        server={size === 'large' ? { total: big.total, page: big.page, loading: big.loading, onPage: big.setPage, onPrefs: big.setPrefs, sortable: (id) => canSort(serverFields[id]), filterable: (id) => !!serverFields[id] } : undefined}
        onView={(shown, _visible, all) => setViewed({ rows: shown, cols: all })}
        bulk={can('edit') || can('delete') ? (picked, clear) => (
          <BulkBar table="companies" ids={picked.map((c) => c.id)} assign={!!ownerColumn} onDone={(message) => { setBulkNote(message); clear(); fetchAll(); }} />
        ) : undefined}
      />

      <NewCompanyModal open={showNew} onClose={() => setShowNew(false)} onCreated={fetchAll} />
      <CompanyDetailModal
        company={activeCompany}
        contacts={activeCompany ? contactsByCompany[activeCompany.id] || [] : []}
        deals={activeCompany ? dealsByCompany[activeCompany.id] || [] : []}
        importLabel={activeCompany?.import_batch_id ? importLabels[activeCompany.import_batch_id] || 'an import' : null}
        onClose={() => setActiveCompany(null)}
        onChanged={fetchAll}
      />
      <DuplicatesModal kind="company" open={showDuplicates} onClose={() => setShowDuplicates(false)} onMerged={fetchAll} />
      <ImportWizardModal open={showImport} onClose={() => setShowImport(false)} onImported={fetchAll} />
      <ImportHistoryModal open={showImportHistory} onClose={() => setShowImportHistory(false)} onChanged={fetchAll} />
    </div>
  );
}

function CompanyFormBoxes({ form, onChange }: { form: CompanyForm; onChange: (next: CompanyForm) => void }) {
  return (
    <>
      <label style={fieldLabelStyle}>Name</label>
      <input style={fieldInputStyle} value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="e.g. Acme Corp" />
      <label style={fieldLabelStyle}>Website (optional)</label>
      <input style={fieldInputStyle} value={form.website_url} onChange={(e) => onChange({ ...form, website_url: e.target.value })} placeholder="https://theircompany.com" />
      {COMPANY_FIELDS.map((f) => (
        <div key={f.key}>
          <label style={fieldLabelStyle}>{f.label} (optional)</label>
          {f.multiline
            ? <textarea style={{ ...fieldInputStyle, minHeight: 60, resize: 'vertical' }} value={form[f.key]} onChange={(e) => onChange({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
            : <input style={fieldInputStyle} value={form[f.key]} onChange={(e) => onChange({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />}
        </div>
      ))}
    </>
  );
}

function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CompanyForm>(blankCompanyForm());
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(blankCompanyForm()); setCustom({}); setError(null); } }, [open]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const row: Record<string, any> = formToCompany(form);
      const values = cleanCustomValues(custom);
      if (Object.keys(values).length) row.custom_fields = values;
      const { error: insertErr } = await supabase.from('companies').insert(row);
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
        <CompanyFormBoxes form={form} onChange={setForm} />
        <CustomFieldsInputs entityType="company" values={custom} onChange={(id, v) => setCustom((c) => ({ ...c, [id]: v }))} />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.7rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CompanyDetailModal({ company, contacts, deals, importLabel, onClose, onChanged }: { company: any | null; contacts: any[]; deals: any[]; importLabel?: string | null; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<CompanyForm>(blankCompanyForm());
  const [saving, setSaving] = useState(false);
  const hasBin = useColumn('companies', 'deleted_at');
  const hasOwner = useColumn('companies', 'assignee_id');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setError(null);
    setEditForm(companyToForm(company));
  }, [company?.id]);

  if (!company) return null;

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.from('companies').update(formToCompany(editForm)).eq('id', company.id);
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
    if (!confirm(hasBin ? `Delete ${company.name}? It stays in the recycle bin for 30 days; its contacts and deals stay.` : msg)) return;
    setSaving(true);
    setError(null);
    try {
      if (await moveToBin(supabase, 'companies', [company.id])) { onChanged(); onClose(); return; }
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
          <CompanyFormBoxes form={editForm} onChange={setEditForm} />
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
            {company.website_url || '— no website on file'} · added {new Date(company.created_at).toLocaleDateString()}{importLabel ? ` · imported from ${importLabel}` : ''}
          </div>

          {filledCompanyDetails(company).map((d) => (
            <div key={d.key} style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ flex: '0 0 110px', color: 'var(--dim)' }}>{d.label}</span>
              <span style={{ flex: 1, whiteSpace: d.multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>{d.value}</span>
            </div>
          ))}

          {hasOwner && <AssigneeSelect table="companies" recordId={company.id} value={company.assignee_id ?? null} onChanged={onChanged} />}

          <TagsEditor table="companies" recordId={company.id} tags={company.tags} onChanged={onChanged} />

          <CustomFieldsSection entityType="company" entity={company} onChanged={onChanged} />

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

          <DesktopRecordTools kind="company" record={company} contacts={contacts} onChanged={onChanged} />
          <CompanySignals companyId={company.id} website={company.website_url} />
          <ActivityTimeline companyId={company.id} />

          <RecordHistory table="companies" recordId={company.id} refreshKey={[company.name, company.website_url, company.phone, company.email, company.address, company.city, company.industry, company.description].join('|')} />

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', margin: '1rem 0' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.2rem' }}>
            <OwnerOnly permission="edit"><button type="button" style={ghostBtnStyle} onClick={() => { setEditForm(companyToForm(company)); setEditing(true); }}>Edit</button></OwnerOnly>
            <OwnerOnly permission="delete"><button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDelete} disabled={saving}>Delete</button></OwnerOnly>
          </div>
        </>
      )}
    </Modal>
  );
}
