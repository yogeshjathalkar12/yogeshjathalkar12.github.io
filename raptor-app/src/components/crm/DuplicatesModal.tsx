import { useEffect, useState } from 'react';
import Modal, { ghostBtnStyle, primaryBtnStyle } from './Modal';
import {
  findDuplicateContacts, findDuplicateCompanies, mergeContacts, mergeCompanies,
  type DuplicateContact, type DuplicateCompany,
} from '../../lib/duplicates';

type Kind = 'contact' | 'company';
type Row = DuplicateContact | DuplicateCompany;

const CONFIG = {
  contact: { find: findDuplicateContacts, merge: mergeContacts, sub: (r: Row) => (r as DuplicateContact).email },
  company: { find: findDuplicateCompanies, merge: mergeCompanies, sub: (r: Row) => (r as DuplicateCompany).website_url },
};

interface DuplicatesModalProps {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

// Reused for both contacts and companies via the `kind` prop - exact-match
// groups only (see lib/duplicates.ts), oldest record defaults as the
// primary (most likely to be the one everything else already links to).
// Same role as the desktop app's DuplicatesManager.js.
export default function DuplicatesModal({ kind, open, onClose, onMerged }: DuplicatesModalProps) {
  const cfg = CONFIG[kind];
  const [groups, setGroups] = useState<Row[][] | null>(null);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGroups(null);
    setError(null);
    (cfg.find() as Promise<Row[][]>).then((found) => {
      setGroups(found);
      const defaults: Record<number, string> = {};
      found.forEach((g, i) => { defaults[i] = g[0].id; });
      setPrimaryByGroup(defaults);
    }).catch((e) => setError(e.message || 'Could not scan for duplicates.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  if (!open) return null;

  const handleMerge = async (group: Row[], idx: number) => {
    const primaryId = primaryByGroup[idx];
    const primary = group.find((r) => r.id === primaryId)!;
    const dups = group.filter((r) => r.id !== primaryId);
    setBusy(true);
    setError(null);
    try {
      await (cfg.merge as any)(primary, dups);
      setGroups((gs) => (gs || []).filter((_, i) => i !== idx));
      onMerged();
    } catch (e: any) {
      setError(e.message || 'Could not merge those records.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Duplicate ${kind === 'contact' ? 'contacts' : 'companies'}`} width={560}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
        {kind === 'contact' ? 'Grouped by matching email address.' : 'Grouped by matching name.'} Pick which record to keep - the others
        are merged into it and removed.
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      {groups === null && <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Scanning…</div>}
      {groups !== null && groups.length === 0 && <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>No duplicates found.</div>}

      {groups && groups.map((group, idx) => (
        <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.9rem', marginBottom: '0.8rem' }}>
          {group.map((r) => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0', fontSize: '0.7rem' }}>
              <input
                type="radio"
                name={`dup-${idx}`}
                checked={primaryByGroup[idx] === r.id}
                onChange={() => setPrimaryByGroup((p) => ({ ...p, [idx]: r.id }))}
              />
              {r.name} <span style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{cfg.sub(r) ? `· ${cfg.sub(r)}` : ''}</span>
            </label>
          ))}
          <button type="button" style={{ ...primaryBtnStyle, flex: 'none', fontSize: '0.6rem', padding: '0.4rem 0.8rem', marginTop: '0.6rem' }} disabled={busy} onClick={() => handleMerge(group, idx)}>
            Merge into selected
          </button>
        </div>
      ))}

      <button type="button" style={ghostBtnStyle} onClick={onClose}>Close</button>
    </Modal>
  );
}
