import { useEffect, useState } from 'react';
import Modal, { ghostBtnStyle } from './Modal';
import ImportUndoPanel, { describeUndoReport } from './ImportUndoPanel';
import { listImports } from '../../lib/import/run';
import type { DbClient, ImportRow } from '../../lib/import/run';

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Not finished', color: 'var(--dim)' },
  committed: { label: 'Imported', color: 'var(--green)' },
  undone: { label: 'Undone', color: 'var(--dim)' },
  undone_partial: { label: 'Partly undone', color: 'var(--dim)' },
};

function summary(c: any): string {
  if (!c || !c.created) return '';
  const parts: string[] = [];
  const cr = c.created;
  if (cr.companies) parts.push(`${cr.companies} companies`);
  if (cr.contacts) parts.push(`${cr.contacts} contacts`);
  if (cr.deals) parts.push(`${cr.deals} deals`);
  if (cr.prospects) parts.push(`${cr.prospects} prospects`);
  if (c.fields_filled) parts.push(`${c.fields_filled} fields filled on existing records`);
  return parts.join(' · ') || 'nothing created';
}

export default function ImportHistoryModal({ open, onClose, onChanged, client }: { open: boolean; onClose: () => void; onChanged?: () => void; client?: DbClient }) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    try { setRows(await listImports(client)); setError(null); } catch (e: any) { setError(String(e?.message || e)); }
  }
  useEffect(() => { if (open) { setRows(null); setNote(null); setUndoing(null); load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title="Import history" width={680}>
      {note && <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginBottom: '1rem' }}>{note}</div>}
      {error && <div style={{ fontSize: '0.7rem', color: 'var(--red)', marginBottom: '1rem' }}>Could not load the history: {error}. If this is the first time, the database update for imports may not be installed yet.</div>}
      {undoing ? (
        <ImportUndoPanel batchId={undoing} client={client} onCancel={() => setUndoing(null)} onDone={(r) => { setNote(describeUndoReport(r)); setUndoing(null); load(); onChanged?.(); }} />
      ) : (
        <>
          {rows && rows.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>No imports yet. Everything you import from now on is listed here, and each one can be undone.</div>}
          {!rows && !error && <div style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>Loading…</div>}
          {(rows || []).map((r) => {
            const st = STATUS[r.status] || STATUS.committed;
            const canUndo = r.status !== 'undone';
            return (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0.8rem 1rem', marginBottom: '0.7rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source_name || r.file_name || 'Import'}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 4 }}>
                    {new Date(r.started_at).toLocaleString()} · <span style={{ color: st.color }}>{st.label}</span>{r.counts?.stopped ? ' · stopped early' : ''}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 2 }}>{r.status === 'undone' || r.status === 'undone_partial' ? describeUndoReport(r.undo_report) : summary(r.counts)}</div>
                </div>
                {canUndo && <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} onClick={() => { setNote(null); setUndoing(r.id); }}>Undo…</button>}
              </div>
            );
          })}
        </>
      )}
    </Modal>
  );
}
