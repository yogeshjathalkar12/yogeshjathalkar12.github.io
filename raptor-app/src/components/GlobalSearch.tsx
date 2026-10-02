import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll, type GlobalSearchResults } from '../lib/globalSearch';
import Modal from './crm/Modal';

// Persistent search box in the topbar (layouts/DashboardLayout.tsx), across
// contacts/companies/deals/calls. Unlike the desktop app (whose CRM pages
// stay mounted), this app's HashRouter actually remounts a page on
// navigation, so a result click can just navigate with a query param -
// the target page (CrmContacts.tsx/CrmPipeline.tsx/CrmCompanies.tsx) reads
// `?open=<id>` on mount and opens that record once its own fetch resolves.
export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [previewCall, setPreviewCall] = useState<GlobalSearchResults['calls'][number] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    const timer = setTimeout(() => {
      searchAll(query).then((r) => { setResults(r); setOpen(true); }).catch((e) => console.error('Global search failed:', e));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = (path: string, id: string) => {
    navigate(`${path}?open=${id}`);
    setOpen(false);
    setQuery('');
  };

  const hasResults = results && (results.contacts.length || results.companies.length || results.deals.length || results.calls.length);

  return (
    <div ref={boxRef} style={{ position: 'relative', width: 200 }}>
      <input
        placeholder="Search CRM…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        style={{
          width: '100%', padding: '0.5rem 0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: '4px',
        }}
      />
      {open && results && (
        <div
          style={{
            position: 'absolute', top: '115%', left: 0, width: 320, maxHeight: 420, overflowY: 'auto', zIndex: 3100,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem',
          }}
        >
          {!hasResults && <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>No matches.</div>}
          {results.contacts.length > 0 && (
            <ResultGroup title="Contacts">
              {results.contacts.map((c) => <ResultRow key={c.id} title={c.name} sub={c.email || undefined} onClick={() => goTo('/crm/contacts', c.id)} />)}
            </ResultGroup>
          )}
          {results.companies.length > 0 && (
            <ResultGroup title="Companies">
              {results.companies.map((c) => <ResultRow key={c.id} title={c.name} onClick={() => goTo('/crm/companies', c.id)} />)}
            </ResultGroup>
          )}
          {results.deals.length > 0 && (
            <ResultGroup title="Deals">
              {results.deals.map((d) => <ResultRow key={d.id} title={d.title} onClick={() => goTo('/crm/pipeline', d.id)} />)}
            </ResultGroup>
          )}
          {results.calls.length > 0 && (
            <ResultGroup title="Calls">
              {results.calls.map((c) => (
                <ResultRow key={c.id} title={c.company_name || 'Call'} sub={new Date(c.created_at).toLocaleDateString()} onClick={() => { setPreviewCall(c); setOpen(false); }} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}

      <Modal open={!!previewCall} onClose={() => setPreviewCall(null)} title={previewCall?.company_name || 'Call'}>
        <div style={{ fontSize: '0.7rem', color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{previewCall?.summary || 'No summary available.'}</div>
      </Modal>
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <div style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--dim2)', margin: '0.4rem 0 0.2rem' }}>{title}</div>
      {children}
    </div>
  );
}

function ResultRow({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <div style={{ padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.7rem' }} onClick={onClick}>
      {title} {sub && <span style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>· {sub}</span>}
    </div>
  );
}
