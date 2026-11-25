import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { type ColumnDef, applyView, cycleSort, displayValue, EMPTY_CHOICE, hasFilters, loadPrefs, moveColumn, reconcilePrefs, savePrefs, setFilter, toggleColumn, defaultPrefs } from '../../lib/tableView';
import type { ViewPrefs } from '../../lib/tableView';

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
}

const small = { fontSize: '0.6rem', color: 'var(--dim)' } as const;
const barBtn = { background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.4rem 0.8rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' } as const;
const filterBox = { width: '100%', padding: '0.35rem 0.5rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: 4 } as const;
const HINT: Record<string, string> = { text: 'contains…', number: '>=100  or  5..20', date: '>=2026-01-01', select: '' };

export default function ViewTable<R>({ columns, rows, storageKey, rowKey, onRowClick, emptyText, onView, toolbarExtra }: Props<R>) {
  const store = useMemo(() => { try { return window.localStorage; } catch { return null; } }, []);
  // what was chosen on an earlier visit, kept as it was written; what is used is that choice made to fit today's columns (a deleted field vanishes from the view)
  const [stored, setStored] = useState<Partial<ViewPrefs> | null>(() => loadPrefs(store, storageKey, columns));
  const prefs = useMemo(() => reconcilePrefs(stored, columns), [stored, columns]);
  const [menu, setMenu] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const change = (next: ViewPrefs) => { setStored(next); savePrefs(store, storageKey, next); };
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const visible = prefs.visible.map((id) => byId.get(id)).filter((c): c is UiColumn<R> => !!c);
  const shown = useMemo(() => applyView(rows, columns, prefs), [rows, columns, prefs]);

  useEffect(() => { onView?.(shown, visible, columns); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = columns.filter((c) => !prefs.visible.includes(c.id));
  const filtering = hasFilters(prefs);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '0.7rem', position: 'relative', flexWrap: 'wrap' }}>
        <span style={small}>{shown.length === rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : `${shown.length} of ${rows.length} rows`}</span>
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

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
              {visible.map((c) => (
                <th key={c.id} onClick={() => change(cycleSort(prefs, c.id))} title="Click to sort" style={{ padding: '0.9rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {c.label}{prefs.sort?.id === c.id ? (prefs.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
            {(filtersOpen || filtering) && (
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {visible.map((c) => (
                  <th key={c.id} style={{ padding: '0.4rem 0.6rem', fontWeight: 'normal' }}>
                    {c.kind === 'select' ? (
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
              <tr><td colSpan={Math.max(visible.length, 1)} style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)' }}>{rows.length === 0 ? emptyText : 'Nothing matches the filters.'}</td></tr>
            ) : shown.map((row) => (
              <tr key={rowKey(row)} onClick={() => onRowClick(row)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
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
    </div>
  );
}
