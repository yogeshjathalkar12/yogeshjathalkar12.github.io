import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { type ColumnDef, applyView, cycleSort, displayValue, EMPTY_CHOICE, hasFilters, savedChoice, moveColumn, reconcilePrefs, savePrefs, setFilter, toggleColumn, defaultPrefs } from '../../lib/tableView';
import type { ViewPrefs } from '../../lib/tableView';
import { pageOf, TABLE_PAGE } from '../../lib/paging';

export interface UiColumn<R> extends ColumnDef<R> {
  /** How the cell looks; without it the plain value is printed (a dash when empty). */
  render?: (row: R) => ReactNode;
  dim?: boolean;
  bold?: boolean;
}

interface Props<R> {
  columns: UiColumn<R>[];
  rows: R[];                                    // already narrowed by the page's own search box
  storageKey: string;                           // one per table and per person
  rowKey: (row: R) => string;
  onRowClick: (row: R) => void;
  emptyText: string;
  /** Told whenever the rows the person sees change (for Export): the rows as shown, the visible columns, and every column. */
  onView?: (rows: R[], visible: UiColumn<R>[], all: UiColumn<R>[]) => void;
  toolbarExtra?: ReactNode;
  /** With this, each row gets a tick box; the bar it returns shows while rows are ticked (only rows still shown count). */
  bulk?: (picked: R[], clear: () => void) => ReactNode;
  /** A very large list: the database searches, filters, sorts and pages (hooks/useLargeList). `rows` is the one page on screen. */
  server?: {
    total: number;
    page: number;
    loading: boolean;
    onPage: (page: number) => void;
    onPrefs: (prefs: ViewPrefs) => void;
    sortable: (columnId: string) => boolean;
    filterable: (columnId: string) => boolean;
  };
}

const small = { fontSize: '0.6rem', color: 'var(--dim)' } as const;
const barBtn = { background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.4rem 0.8rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' } as const;
const filterBox = { width: '100%', padding: '0.35rem 0.5rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: 4 } as const;
const HINT: Record<string, string> = { text: 'contains…', number: '>=100  or  5..20', date: '>=2026-01-01', select: '' };

export default function ViewTable<R>({ columns, rows, storageKey, rowKey, onRowClick, emptyText, onView, toolbarExtra, bulk, server }: Props<R>) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const store = useMemo(() => { try { return window.localStorage; } catch { return null; } }, []);
  // what was chosen on an earlier visit, kept as it was written; what is used is that choice made to fit today's columns (a deleted field vanishes from the view)
  const [stored, setStored] = useState<Partial<ViewPrefs> | null>(() => savedChoice(store, storageKey));
  const prefs = useMemo(() => reconcilePrefs(stored, columns), [stored, columns]);
  const [menu, setMenu] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const change = (next: ViewPrefs) => { setStored(next); savePrefs(store, storageKey, next); };
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const visible = prefs.visible.map((id) => byId.get(id)).filter((c): c is UiColumn<R> => !!c);
  const remote = !!server;
  const shown = useMemo(() => (remote ? rows : applyView(rows, columns, prefs)), [rows, columns, prefs, remote]);
  const chosen = JSON.stringify([prefs.sort, prefs.filters]);
  useEffect(() => { server?.onPrefs(prefs); }, [chosen, remote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Told only when what is shown really changed (same rows in the same order, same columns = nothing to tell). A page that builds its
  // row list again on every render would otherwise make this effect and the page's own state feed each other without end.
  const told = useRef<{ rows: R[]; columns: UiColumn<R>[] } | null>(null);
  useEffect(() => {
    if (!onView) return;
    const last = told.current;
    if (last && last.columns === columns && last.rows.length === shown.length && last.rows.every((r, i) => r === shown[i])) return;
    told.current = { rows: shown, columns };
    onView(shown, visible, columns);
  }, [shown, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  // only one page is drawn; a new sort or filter starts again at the first page
  const [pageNumber, setPageNumber] = useState(0);
  const arrangement = JSON.stringify([prefs.sort, prefs.filters]);
  useEffect(() => { setPageNumber(0); }, [arrangement]);
  const page = server
    ? { rows: shown, page: server.page, pages: Math.max(1, Math.ceil(server.total / TABLE_PAGE)), from: shown.length ? server.page * TABLE_PAGE + 1 : 0, to: server.page * TABLE_PAGE + shown.length }
    : pageOf(shown, pageNumber);
  const goTo = server ? server.onPage : setPageNumber;
  const matching = server ? server.total : shown.length;
  const sortable = (id: string) => !server || server.sortable(id);

  const picked = bulk ? shown.filter((r) => ticked.has(rowKey(r))) : [];
  const allTicked = page.rows.length > 0 && page.rows.every((r) => ticked.has(rowKey(r)));      // the box at the top is about this page
  const tick = (key: string) => setTicked((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const tickPage = () => setTicked((old) => { const next = new Set(old); page.rows.forEach((r) => { if (allTicked) next.delete(rowKey(r)); else next.add(rowKey(r)); }); return next; });
  const hidden = columns.filter((c) => !prefs.visible.includes(c.id));
  const filtering = hasFilters(prefs);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '0.7rem', position: 'relative', flexWrap: 'wrap' }}>
        <span style={small}>{server ? (server.loading ? 'Loading…' : `${server.total.toLocaleString()} rows`) : shown.length === rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : `${shown.length} of ${rows.length} rows`}</span>
        {filtering && <button type="button" style={barBtn} onClick={() => change({ ...prefs, filters: {} })}>Clear filters</button>}
        <button type="button" style={{ ...barBtn, color: filtersOpen || filtering ? 'var(--white)' : 'var(--dim)' }} onClick={() => setFiltersOpen((v) => !v)}>Filters</button>
        <button type="button" style={{ ...barBtn, color: menu ? 'var(--white)' : 'var(--dim)' }} onClick={() => setMenu((v) => !v)}>Columns</button>
        {toolbarExtra}
        {menu && (
          <>
            <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
            <div style={{ position: 'absolute', right: 0, top: '2.2rem', zIndex: 21, width: 300, maxHeight: 420, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' }}>
              <div style={{ ...small, marginBottom: '0.5rem' }}>Tick what to show. Use the arrows to reorder. Your choice is remembered for you.</div>
              {prefs.visible.map((id, i) => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.7rem' }}>
                    <input type="checkbox" checked disabled={c.locked} onChange={() => change(toggleColumn(prefs, columns, id))} />
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <button type="button" aria-label={`Move ${c.label} up`} disabled={i === 0} style={{ ...barBtn, padding: '0.1rem 0.45rem' }} onClick={() => change(moveColumn(prefs, id, -1))}>↑</button>
                    <button type="button" aria-label={`Move ${c.label} down`} disabled={i === prefs.visible.length - 1} style={{ ...barBtn, padding: '0.1rem 0.45rem' }} onClick={() => change(moveColumn(prefs, id, 1))}>↓</button>
                  </div>
                );
              })}
              {hidden.length > 0 && <div style={{ ...small, margin: '0.7rem 0 0.3rem' }}>Not shown</div>}
              {hidden.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.7rem', color: 'var(--dim)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={false} onChange={() => change(toggleColumn(prefs, columns, c.id))} />
                  <span>{c.label}</span>
                </label>
              ))}
              <button type="button" style={{ ...barBtn, marginTop: '0.8rem', width: '100%' }} onClick={() => change(defaultPrefs(columns))}>Back to the standard columns</button>
            </div>
          </>
        )}
      </div>

      {bulk && picked.length > 0 && bulk(picked, () => setTicked(new Set()))}
      {bulk && !server && allTicked && page.pages > 1 && picked.length < shown.length && (
        <div style={{ ...small, marginBottom: 8 }}>
          The {page.rows.length} on this page are ticked.{' '}
          <button type="button" style={{ ...barBtn, padding: '0.2rem 0.6rem' }} onClick={() => setTicked(new Set(shown.map(rowKey)))}>Select all {shown.length}</button>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
              {bulk && (
                <th style={{ padding: '0.9rem 0 0.9rem 1rem', width: 28 }}>
                  <input type="checkbox" aria-label="Select all shown" checked={allTicked} onChange={tickPage} />
                </th>
              )}
              {visible.map((c) => (
                <th key={c.id} onClick={() => { if (sortable(c.id)) change(cycleSort(prefs, c.id)); }} title={sortable(c.id) ? 'Click to sort' : 'Not sortable in a very large list'} style={{ padding: '0.9rem 1rem', cursor: sortable(c.id) ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {c.label}{prefs.sort?.id === c.id && sortable(c.id) ? (prefs.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
            {(filtersOpen || filtering) && (
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {bulk && <th />}
                {visible.map((c) => (
                  <th key={c.id} style={{ padding: '0.4rem 0.6rem', fontWeight: 'normal' }}>
                    {server && !server.filterable(c.id) ? (
                      <input style={{ ...filterBox, opacity: 0.5 }} disabled value="" placeholder="not in large lists" aria-label={`Filter ${c.label}`} />
                    ) : c.kind === 'select' ? (
                      <select style={filterBox} value={prefs.filters[c.id] || ''} onChange={(e) => change(setFilter(prefs, c.id, e.target.value))} aria-label={`Filter ${c.label}`}>
                        <option value="">All</option>
                        {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        <option value={EMPTY_CHOICE}>(empty)</option>
                      </select>
                    ) : (
                      <input style={filterBox} value={prefs.filters[c.id] || ''} placeholder={HINT[c.kind]} aria-label={`Filter ${c.label}`} onChange={(e) => change(setFilter(prefs, c.id, e.target.value))} />
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={Math.max(visible.length, 1) + (bulk ? 1 : 0)} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>{server?.loading ? 'Loading…' : server && filtering ? 'Nothing matches the filters.' : rows.length === 0 ? emptyText : 'Nothing matches the filters.'}</td></tr>
            ) : page.rows.map((row) => (
              <tr key={rowKey(row)} onClick={() => onRowClick(row)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                {bulk && (
                  <td style={{ padding: '1rem 0 1rem 1rem' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select this row" checked={ticked.has(rowKey(row))} onChange={() => tick(rowKey(row))} />
                  </td>
                )}
                {visible.map((c) => (
                  <td key={c.id} style={{ padding: '1rem', fontWeight: c.bold ? 'bold' : undefined, color: c.dim ? 'var(--dim)' : undefined, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.render ? c.render(row) : displayValue(c.kind, c.value(row))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page.pages > 1 && (
        <nav aria-label="Pages" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'flex-end', marginTop: '0.7rem', flexWrap: 'wrap' }}>
          <span style={small}>{page.from}–{page.to} of {matching.toLocaleString()}</span>
          <button type="button" style={barBtn} disabled={page.page === 0 || server?.loading} onClick={() => goTo(page.page - 1)}>Previous</button>
          <span style={small}>Page {page.page + 1} of {page.pages}</span>
          <button type="button" style={barBtn} disabled={page.page >= page.pages - 1 || server?.loading} onClick={() => goTo(page.page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
