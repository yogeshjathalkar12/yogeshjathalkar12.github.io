import { useEffect, useState } from 'react';
import { primaryBtnStyle, ghostBtnStyle } from './Modal';
import { previewUndo, runUndo } from '../../lib/import/run';
import type { DbClient } from '../../lib/import/run';

// "Undo this import": shows exactly what would go and what would stay (and why) BEFORE anything is removed,
// then removes it in rounds until the database says it is done. Used by the import history and by the wizard's last step.

const LABEL: Record<string, string> = { companies: 'companies', contacts: 'contacts', deals: 'deals', prospect_dossiers: 'prospects' };
const small = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 } as const;

function counts(o: Record<string, number> | undefined) {
  const parts = Object.entries(o || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LABEL[k] || k}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export default function ImportUndoPanel({ batchId, onDone, onCancel, client }: { batchId: string; onDone: (report: any) => void; onCancel: () => void; client?: DbClient }) {
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeEdited, setIncludeEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(0);

  useEffect(() => {
    let live = true;
    previewUndo(batchId, client).then((p) => live && setPreview(p)).catch((e) => live && setError(String(e?.message || e)));
    return () => { live = false; };
  }, [batchId, client]);

  async function go() {
    setBusy(true); setError(null); setRemoved(0);
    try {
      const report = await runUndo(batchId, includeEdited, (r) => {
        const t = r?.deleted_this_round || {};
        setRemoved((n) => n + Object.values(t as Record<string, number>).reduce((a, b) => a + b, 0));
      }, client);
      onDone(report);
    } catch (e: any) {
      setError(String(e?.message || e));
      setBusy(false);
    }
  }

  if (error && !preview) return <div style={{ color: 'var(--red)', fontSize: '0.7rem' }}>{error}<div style={{ marginTop: '0.8rem' }}><button type="button" style={ghostBtnStyle} onClick={onCancel}>Close</button></div></div>;
  if (!preview) return <div style={small}>Checking what Undo would do…</div>;
  if (preview.status === 'undone') return <div style={small}>This import was already undone.<div style={{ marginTop: '0.8rem' }}><button type="button" style={ghostBtnStyle} onClick={onCancel}>Close</button></div></div>;

  const now = preview.now || {};
  const keptDetail = now.kept_detail || {};
  const keptAny = Object.values(now.kept || {}).some((n) => (n as number) > 0);
  const editedAny = Object.values(keptDetail).some((d: any) => d?.edited_since > 0);
  const all = preview.if_edited_too || {};

  return (
    <div>
      <div style={{ fontSize: '0.75rem', marginBottom: '0.7rem' }}>
        Undo will remove <strong>{counts(includeEdited ? all.deleted : now.deleted)}</strong>
        {preview.updates_to_restore > 0 && <> and put back the {now.fields_restored ?? 0} field{now.fields_restored === 1 ? '' : 's'} this import filled on existing records</>}.
      </div>
      {keptAny && (
        <div style={{ ...small, border: '1px solid var(--border)', borderRadius: 4, padding: '0.7rem 0.9rem', marginBottom: '0.8rem' }}>
          <strong style={{ color: 'var(--white)' }}>These stay, so nothing you have worked on is lost:</strong> {counts(includeEdited ? all.kept : now.kept)}.
          {' '}A record stays when something now points at it (a task, a call, an email, a deal) or when someone edited it after the import.
          {(now.kept_examples || []).slice(0, 5).map((e: any, i: number) => <div key={i}>· {e.label || e.table} — {e.why}</div>)}
        </div>
      )}
      {now.fields_left_as_edited > 0 && <div style={{ ...small, marginBottom: '0.8rem' }}>{now.fields_left_as_edited} filled field{now.fields_left_as_edited === 1 ? '' : 's'} stay as they are because someone changed them since.</div>}
      {editedAny && (
        <label style={{ ...small, display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.8rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={includeEdited} onChange={(e) => setIncludeEdited(e.target.checked)} disabled={busy} />
          <span>Also remove the imported records that were edited since (nothing that something else points at is ever removed).</span>
        </label>
      )}
      <div style={{ ...small, marginBottom: '1rem' }}>Every removed record is first copied to a safe archive, so support can bring it back.</div>
      {busy && <div style={{ ...small, marginBottom: '0.8rem' }}>Removing… {removed} so far. Keep this window open.</div>}
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error} You can press Undo again; nothing is lost.</div>}
      <div style={{ display: 'flex', gap: '0.7rem' }}>
        <button type="button" style={ghostBtnStyle} onClick={onCancel} disabled={busy}>Keep the import</button>
        <button type="button" style={{ ...primaryBtnStyle, background: 'var(--red)' }} onClick={go} disabled={busy}>{busy ? 'Undoing…' : 'Undo this import'}</button>
      </div>
    </div>
  );
}

export function describeUndoReport(r: any): string {
  if (!r) return '';
  const del = counts(r.deleted);
  const kept = Object.values(r.kept || {}).reduce((a: number, b) => a + (b as number), 0);
  return `Removed ${del}.${kept ? ` ${kept} stayed because they are in use or were edited.` : ''}${r.fields_restored ? ` ${r.fields_restored} filled field${r.fields_restored === 1 ? '' : 's'} put back.` : ''}`;
}
