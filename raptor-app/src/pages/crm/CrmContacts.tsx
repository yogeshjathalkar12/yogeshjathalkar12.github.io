import AssignmentRulesModal from '../../components/crm/AssignmentRulesModal';
import { toolBtnStyle } from '../../components/crm/Modal';
import ScoringRulesModal from '../../components/crm/ScoringRulesModal';
import { type ScoreRule, scoreContact } from '../../lib/scoring';
import { useColumn } from '../../hooks/useColumn';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime } from '../../lib/crmHelpers';
import NewContactModal from '../../components/crm/NewContactModal';
import ContactPanel from '../../components/crm/ContactPanel';
import ImportWizardModal from '../../components/crm/ImportWizardModal';
import ImportHistoryModal from '../../components/crm/ImportHistoryModal';
import ExportButton from '../../components/crm/ExportButton';
import ViewTable from '../../components/crm/ViewTable';
import type { UiColumn } from '../../components/crm/ViewTable';
import { customFieldColumns, customSearchText } from '../../lib/viewColumns';
import { loadFieldDefs } from '../../lib/customFields';
import type { CustomFieldDef } from '../../lib/customFields';
import DuplicatesModal from '../../components/crm/DuplicatesModal';
import OwnerOnly from '../../components/OwnerOnly';
import AssigneeFilter, { applyAssigneeFilter, useAssigneeFilter } from '../../components/crm/AssigneeFilter';
import { useMemberLabels } from '../../hooks/useDirectory';
import { useAuth } from '../../hooks/AuthContext';
import { shortName } from '../../lib/team';
import { exportRecords } from '../../lib/tableView';
import { selectAll } from '../../lib/selectAll';
import { companyIdsNamed, useLargeList, useListSize } from '../../hooks/useLargeList';
import { canSort, customServerField, type ServerField } from '../../lib/largeList';
import { useDirectory } from '../../hooks/useDirectory';
import { coalesce } from '../../lib/coalesce';
import LoadingMore from '../../components/crm/LoadingMore';
import { useOrg } from '../../hooks/OrgContext';
import BulkBar from '../../components/crm/BulkBar';
import { desktopColumns } from '../../lib/desktop';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  hot: { bg: 'rgba(239,68,68,0.1)', fg: 'var(--red)' },
  cold: { bg: 'rgba(113,113,122,0.1)', fg: 'var(--dim)' },
  active: { bg: 'rgba(34,197,94,0.1)', fg: 'var(--green)' },
};

export default function CrmContacts() {
  const hasAssignment = useColumn('assignment_rules', 'id');
  const [showAssignment, setShowAssignment] = useState(false);
  const hasScoring = useColumn('lead_score_rules', 'id');
  const [scoreRules, setScoreRules] = useState<ScoreRule[]>([]);
  const [showScoring, setShowScoring] = useState(false);
  const loadScoring = useCallback(async () => {
    const { data, error } = await supabase.from('lead_score_rules').select('*').order('created_at', { ascending: true });
    if (!error) setScoreRules((data || []) as ScoreRule[]);
  }, []);
  useEffect(() => { if (hasScoring) loadScoring(); }, [hasScoring, loadScoring]);
  const tagColumn = useColumn('contacts', 'tags');
  const hasJobTitle = useColumn('contacts', 'job_title');
  const [bulkNote, setBulkNote] = useState('');
  const { can, isOwner, isAdmin } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [assigneeFilter, setAssigneeFilter] = useAssigneeFilter('contacts');
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewContact, setShowNewContact] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [activeContact, setActiveContact] = useState<any | null>(null);
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [importLabels, setImportLabels] = useState<Record<string, string>>({});
  const [viewed, setViewed] = useState<{ rows: any[]; cols: UiColumn<any>[] }>({ rows: [], cols: [] });
  const [partial, setPartial] = useState(0);            // how many are shown while the rest of a long list is still coming
  const loadedOnce = useRef(false);
  // A very long list is not downloaded: the database searches, filters, sorts and sends one page.
  const size = useListSize('contacts');
  const sizeNow = useRef(size);
  sizeNow.current = size;
  const { entries: people } = useDirectory();
  const reloadPage = useRef<() => void>(() => {});

  useEffect(() => {
    if (size === 'counting') return;
    fetchAll();
    const reload = coalesce(fetchAll);

    const channel = supabase
      .channel('crm-contacts-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, reload)
      .subscribe();

    return () => {
      reload.cancel();
      supabase.removeChannel(channel);
    };
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const big = sizeNow.current === 'large';
    if (big) reloadPage.current();
    try {
      const [contactsRes, dealsRes, interactionsRes, fieldDefs, importsRes] = await Promise.all([
        big ? Promise.resolve({ data: [] as any[], error: null }) : selectAll(() => supabase
          .from('contacts')
          .select('*, companies(id, name)')
          .order('last_interaction_at', { ascending: false, nullsFirst: false }), 'id', (first: any[]) => {
            // the first time only: a later reload keeps the full list on screen until the new one is complete
            if (loadedOnce.current) return;
            setContacts(first);
            setPartial(first.length);
            setLoading(false);
          }),
        big ? Promise.resolve({ data: [] as any[], error: null }) : selectAll(() => supabase.from('deals').select('id, contact_id, stage')),
        supabase
          .from('interactions')
          .select('*, contacts(id, name)')
          .order('created_at', { ascending: false })
          .limit(200),
        loadFieldDefs('contact').catch(() => [] as CustomFieldDef[]),
        Promise.resolve(supabase.from('crm_imports').select('id, source_name, file_name, started_at')).catch(() => ({ data: [] as any[] })),   // the import log may not exist yet
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (interactionsRes.error) throw interactionsRes.error;

      setDefs(fieldDefs);
      const labels: Record<string, string> = {};
      for (const i of (importsRes as any).data || []) labels[i.id] = `${i.source_name || i.file_name || 'Import'} · ${String(i.started_at || '').slice(0, 10)}`;
      setImportLabels(labels);
      setInteractions(interactionsRes.data || []);
      loadedOnce.current = true;
      if (big) return;                       // its rows and their deals come a page at a time, below
      setContacts(contactsRes.data || []);
      setPartial(0);
      setDeals(dealsRes.data || []);

      setActiveContact((prev: any) =>
        prev ? (contactsRes.data || []).find((c: any) => c.id === prev.id) || null : null
      );
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  // GlobalSearch.tsx navigates here with ?open=<id> - once the real fetch
  // resolves, open that contact and drop the param.
  useEffect(() => {
    const openId = searchParams.get('open');
    const big = size === 'large';
    if (!openId || size === 'counting' || (!big && (contacts.length === 0 || partial))) return;      // the wanted one may be in the part still coming
    const done = (match: any) => {
      if (match) setActiveContact(match);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    };
    if (!big) done(contacts.find((c) => c.id === openId));
    else Promise.resolve(supabase.from('contacts').select('*, companies(id, name)').eq('id', openId).maybeSingle()).then(({ data }: any) => done(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, partial, size]);

  const serverFields: Record<string, ServerField> = useMemo(() => {
    const out: Record<string, ServerField> = {
      name: { type: 'text', column: 'name' },
      company: { type: 'lookup', column: 'company_id' },
      last_touch: { type: 'date', column: 'last_interaction_at' },
      status: { type: 'choice', column: 'status', emptyAs: 'cold' },
      assigned: { type: 'lookup', column: 'assignee_id' },
      ...(hasJobTitle ? { job_title: { type: 'text' as const, column: 'job_title' } } : {}),
      email: { type: 'text', column: 'email' },
      phone: { type: 'text', column: 'phone' },
      linkedin: { type: 'text', column: 'linkedin_url' },
      ...(scoreRules.length ? {} : { lead_score: { type: 'number' as const, column: 'lead_score' } }),
      imported: { type: 'lookup', column: 'import_batch_id' },
      created: { type: 'date', column: 'created_at' },
    };
    for (const def of defs) { const field = customServerField(def); if (field) out[`cf:${def.id}`] = field; }
    return out;
  }, [defs, hasJobTitle, scoreRules.length]);

  const big = useLargeList({
    enabled: size === 'large',
    table: 'contacts',
    select: '*, companies(id, name)',
    fields: serverFields,
    defaultOrder: { column: 'last_interaction_at', ascending: false },
    search,
    searchColumns: ['name', 'email', 'phone', ...(hasJobTitle ? ['job_title'] : [])],
    searchCompanies: true,
    assignee: { filter: assigneeFilter, me: user?.id || null },
    lookup: (column, text) => {
      if (column === 'company') return companyIdsNamed(text);
      const wanted = text.toLowerCase();
      if (column === 'assigned') return people.filter((p) => shortName(p.email).toLowerCase().includes(wanted)).map((p) => p.user_id);
      return Object.entries(importLabels).filter(([, label]) => label === text).map(([id]) => id);
    },
  });
  reloadPage.current = big.reload;
  useEffect(() => {
    if (size !== 'large') return;
    setContacts(big.rows);
    setActiveContact((prev: any) => (prev ? big.rows.find((c: any) => c.id === prev.id) || prev : null));
    const ids = big.rows.map((c: any) => c.id);
    if (!ids.length) { setDeals([]); return; }
    // the deal counts of the people on this page only
    Promise.resolve(supabase.from('deals').select('id, contact_id, stage').in('contact_id', ids)).then(({ data }: any) => setDeals(data || []));
  }, [big.rows, size]);

  const q = search.trim().toLowerCase();
  const filtered = contacts.filter(
    (c) =>
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.companies?.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.job_title || '').toLowerCase().includes(q) ||
      (c.tags || []).some((t: string) => t.toLowerCase().includes(q)) ||
      (c.phone || '').toLowerCase().includes(q) ||
      customSearchText(c.custom_fields).some((v) => v.toLowerCase().includes(q))
  );

  const assigneeLabels = useMemberLabels(contacts.map((c) => c.assignee_id));
  const rows = size === 'large' ? contacts : applyAssigneeFilter(filtered, assigneeFilter, user?.id);

  // counted once for everyone: searching the deals again for each of thousands of contacts would stall the page
  const activeDeals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of deals) if (d.contact_id && d.stage !== 'won' && d.stage !== 'lost') counts.set(d.contact_id, (counts.get(d.contact_id) || 0) + 1);
    return counts;
  }, [deals]);
  const activeDealCount = (contactId: string) => activeDeals.get(contactId) || 0;

  const columns: UiColumn<any>[] = useMemo(() => {
    const importedOptions = [...new Set(Object.values(importLabels))];
    const built: UiColumn<any>[] = [
      { id: 'name', label: 'Name', kind: 'text', value: (c) => c.name, locked: true, bold: true },
      { id: 'company', label: 'Company', kind: 'text', value: (c) => c.companies?.name, defaultVisible: true, dim: true },
      { id: 'last_touch', label: 'Last Touch', kind: 'date', value: (c) => c.last_interaction_at, defaultVisible: true, dim: true, render: (c) => relativeTime(c.last_interaction_at) },
      {
        id: 'status', label: 'Status', kind: 'select', value: (c) => c.status || 'cold', options: ['new', 'cold', 'active', 'hot'], defaultVisible: true,
        render: (c) => {
          const colors = STATUS_COLORS[c.status || 'cold'] || STATUS_COLORS.cold;
          return <span style={{ background: colors.bg, color: colors.fg, padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.status || 'cold'}</span>;
        },
      },
      { id: 'assigned', label: 'Assigned', kind: 'text', value: (c) => (c.assignee_id ? shortName(assigneeLabels[c.assignee_id]) : null), defaultVisible: true, dim: true },
      { id: 'active_deals', label: 'Active Deals', kind: 'number', value: (c) => activeDealCount(c.id), defaultVisible: true },
      ...(hasJobTitle ? [{ id: 'job_title', label: 'Job title', kind: 'text' as const, value: (c: any) => c.job_title, dim: true }] : []),
      ...(tagColumn ? [{ id: 'tags', label: 'Tags', kind: 'text' as const, value: (c: any) => (c.tags || []).join(', ') }] : []),
      { id: 'email', label: 'Email', kind: 'text', value: (c) => c.email, dim: true },
      { id: 'phone', label: 'Phone', kind: 'text', value: (c) => c.phone, dim: true },
      { id: 'linkedin', label: 'LinkedIn', kind: 'text', value: (c) => c.linkedin_url, dim: true },
      ...(scoreRules.length
        ? [{ id: 'score', label: 'Score', kind: 'number' as const, value: (c: any) => scoreContact(c, scoreRules), defaultVisible: true }]
        : [{ id: 'lead_score', label: 'Lead score', kind: 'number' as const, value: (c: any) => c.lead_score }]),
      { id: 'imported', label: 'Imported from', kind: 'select', value: (c) => (c.import_batch_id ? importLabels[c.import_batch_id] || 'an import' : null), options: importedOptions, dim: true },
      { id: 'created', label: 'Added', kind: 'date', value: (c) => c.created_at, dim: true },
    ];
    return [...built, ...customFieldColumns(defs, (c: any) => c.custom_fields, contacts), ...desktopColumns('contact')];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, importLabels, contacts, deals, assigneeLabels, hasJobTitle, tagColumn, scoreRules]);

  // the rows exactly as the person sees them (search, filters, sort) with every column, also the hidden ones and their own fields
  const exportFile = useMemo(() => exportRecords(viewed.rows, viewed.cols), [viewed]);
  // a very large list: everything that matches is fetched when Export is pressed
  const exportAll = async () => {
    const [all, allDeals] = await Promise.all([big.everything(), selectAll(() => supabase.from('deals').select('id, contact_id, stage'))]);
    if (allDeals.error) throw allDeals.error;
    const open = new Map<string, number>();
    for (const d of allDeals.data || []) if (d.contact_id && d.stage !== 'won' && d.stage !== 'lost') open.set(d.contact_id, (open.get(d.contact_id) || 0) + 1);
    const cols = columns.map((col) => (col.id === 'active_deals' ? { ...col, value: (r: any) => open.get(r.id) || 0 }
      : col.id === 'assigned' ? { ...col, value: (r: any) => (r.assignee_id ? shortName(people.find((p) => p.user_id === r.assignee_id)?.email) : null) } : col));
    return exportRecords(all, cols);
  };

  if (loading || size === 'counting') {
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
        <AssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} />
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <ExportButton data={partial ? [] : exportFile.data} columns={exportFile.columns} filename="contacts" label="Export CSV (all columns)" load={size === 'large' ? exportAll : undefined} />
          {hasAssignment && (isOwner || isAdmin) && <button type="button" style={toolBtnStyle} onClick={() => setShowAssignment(true)}>Assignment rules</button>}
          {hasScoring && can('manage_pipeline') && <button type="button" style={toolBtnStyle} onClick={() => setShowScoring(true)}>Scoring rules</button>}
          <OwnerOnly permission="delete"><button
            onClick={() => setShowDuplicates(true)}
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
            Find Duplicates
          </button></OwnerOnly>
          <OwnerOnly><button
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
            Import
          </button></OwnerOnly>
          <button
            onClick={() => setShowImportHistory(true)}
            style={{ background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Import History
          </button>
          <OwnerOnly permission="create"><button
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
          </button></OwnerOnly>
        </div>
      </div>

      {bulkNote && <div role="status" style={{ fontSize: '0.65rem', color: 'var(--green)', marginBottom: 8 }}>{bulkNote}</div>}
      <LoadingMore count={partial} />
      {size === 'large' && <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: 6 }}>A very large list: it is shown a page at a time. The search box looks at names, emails, phones, job titles and company names.</div>}
      {size === 'large' && big.error && <div role="alert" style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: 8 }}>{big.error}</div>}
      <ViewTable
        columns={columns}
        rows={rows}
        storageKey={`contacts:${user?.id || 'anon'}`}
        rowKey={(c) => c.id}
        onRowClick={(c) => setActiveContact(c)}
        emptyText={contacts.length === 0 && !search.trim() && assigneeFilter === 'all' ? 'No contacts yet.' : 'No contacts match your search.'}
        onView={(shown, _visible, all) => setViewed({ rows: shown, cols: all })}
        server={size === 'large' ? { total: big.total, page: big.page, loading: big.loading, onPage: big.setPage, onPrefs: big.setPrefs, sortable: (id) => canSort(serverFields[id]), filterable: (id) => !!serverFields[id] } : undefined}
        bulk={can('edit') || can('delete') ? (picked, clear) => (
          <BulkBar table="contacts" ids={picked.map((c) => c.id)} assign byRules={!!hasAssignment && (isOwner || isAdmin)}
            choices={[{ label: 'Set status', options: [['hot', 'Hot'], ['active', 'Active'], ['cold', 'Cold']], patch: (status) => ({ status }) }]}
            onDone={(message) => { setBulkNote(message); clear(); fetchAll(); }} />
        ) : undefined}
      />

      <AssignmentRulesModal open={showAssignment} onClose={() => setShowAssignment(false)} />
      <ScoringRulesModal open={showScoring} rules={scoreRules} defs={defs} onClose={() => setShowScoring(false)} onChanged={loadScoring} />
      <NewContactModal open={showNewContact} onClose={() => setShowNewContact(false)} onCreated={fetchAll} />
      <ImportWizardModal open={showImport} onClose={() => setShowImport(false)} onImported={fetchAll} />
      <ImportHistoryModal open={showImportHistory} onClose={() => setShowImportHistory(false)} onChanged={fetchAll} />
      <ContactPanel
        contact={activeContact}
        interactions={interactions}
        onClose={() => setActiveContact(null)}
        onChanged={fetchAll}
      />
      <DuplicatesModal kind="contact" open={showDuplicates} onClose={() => setShowDuplicates(false)} onMerged={fetchAll} />
    </div>
  );
}