import { useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import {
  type PipelineStage,
  type StageType,
  RESERVED_KEYS,
  createStage,
  renameStage,
  reorderStages,
  deleteStage,
} from '../../lib/pipelineStages';

const TYPE_LABELS: Record<StageType, string> = { open: 'Open', won: 'Won', lost: 'Lost' };
const TYPE_COLORS: Record<StageType, string> = { open: '#3b82f6', won: 'var(--green)', lost: 'var(--red)' };

const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--dim)',
  border: '1px solid var(--border)',
  padding: '0.35rem 0.7rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '0.58rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

interface PipelineStagesModalProps {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  dealCountByStage: Record<string, number>;
  onChanged: () => Promise<void> | void;
}

export default function PipelineStagesModal({ open, onClose, stages, dealCountByStage, onChanged }: PipelineStagesModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingStage, setDeletingStage] = useState<PipelineStage | null>(null);
  const [replacementKey, setReplacementKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<StageType>('open');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function startRename(stage: PipelineStage) {
    setRenamingId(stage.id);
    setRenameValue(stage.label);
  }

  function saveRename(stage: PipelineStage) {
    run(async () => {
      if (!renameValue.trim()) throw new Error('Stage name is required.');
      await renameStage(stage, renameValue);
      setRenamingId(null);
    });
  }

  function handleDrop(targetStage: PipelineStage) {
    if (!draggedId || draggedId === targetStage.id) {
      setDraggedId(null);
      return;
    }
    const from = stages.findIndex((s) => s.id === draggedId);
    const to = stages.findIndex((s) => s.id === targetStage.id);
    setDraggedId(null);
    if (from === -1 || to === -1) return;
    const reordered = [...stages];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    run(() => reorderStages(reordered));
  }

  function askDelete(stage: PipelineStage) {
    const count = dealCountByStage[stage.key] || 0;
    if (count > 0) {
      setDeletingStage(stage);
      // Default to the PRECEDING stage (stages is already sort_order-
      // ascending) - "move deals back one step" is a much saner default
      // than an arbitrary other stage, since deleting e.g. "Negotiating"
      // most often means "merge it back into Meeting Booked," not "lose
      // track of how far these deals had actually gotten." Falls back to
      // the following stage when deleting the very first one (nothing
      // precedes it), then any other stage as a last resort.
      const idx = stages.findIndex((s) => s.id === stage.id);
      const defaultReplacement = stages[idx - 1] || stages[idx + 1] || stages.find((s) => s.id !== stage.id);
      setReplacementKey(defaultReplacement?.key || '');
      return;
    }
    const reservedNote = RESERVED_KEYS.has(stage.key)
      ? '\n\nThis stage is also used by the desktop app\'s automatic deal-stage updates (replies, detected meetings, closed outcomes). Deleting it means those automatic updates stop showing up unless you add a stage with equivalent meaning back later.'
      : '';
    if (!window.confirm(`Delete "${stage.label}"?${reservedNote}`)) return;
    run(() => deleteStage(stage, null));
  }

  function confirmDeleteWithReassign(stage: PipelineStage) {
    run(async () => {
      await deleteStage(stage, replacementKey);
      setDeletingStage(null);
    });
  }

  function handleAdd() {
    run(async () => {
      if (!newLabel.trim()) throw new Error('Enter a name for the new stage.');
      await createStage(newLabel, newType);
      setNewLabel('');
      setNewType('open');
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Customize Pipeline" width={520}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
        Drag to reorder, rename anything, add stages that match how your team actually sells, or remove ones you
        don't use. The default pipeline is just your starting point — nothing here is fixed.
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      <div style={{ marginBottom: '1.4rem' }}>
        {stages.map((s) => (
          <div
            key={s.id}
            draggable={renamingId !== s.id}
            onDragStart={() => setDraggedId(s.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.6rem 0',
              borderTop: '1px solid var(--border)',
              opacity: draggedId === s.id ? 0.4 : 1,
              cursor: 'grab',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--dim2)' }}>⠿</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[s.type], flexShrink: 0 }} />

            {renamingId === s.id ? (
              <>
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={{ ...fieldInputStyle, flex: 1, marginBottom: 0 }}
                  autoFocus
                />
                <button style={smallBtnStyle} disabled={busy} onClick={() => saveRename(s)}>Save</button>
                <button style={smallBtnStyle} onClick={() => setRenamingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '0.72rem' }}>
                  {s.label}{' '}
                  <span style={{ fontSize: '0.58rem', color: 'var(--dim2)' }}>
                    · {TYPE_LABELS[s.type]}{dealCountByStage[s.key] ? ` · ${dealCountByStage[s.key]} deal(s)` : ''}
                  </span>
                </span>
                <button style={smallBtnStyle} onClick={() => startRename(s)}>Rename</button>
                <button style={smallBtnStyle} disabled={busy} onClick={() => askDelete(s)}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>

      {deletingStage && (
        <div
          style={{
            border: '1px solid rgba(255,193,7,0.5)',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1.4rem',
          }}
        >
          <div style={{ fontSize: '0.65rem', marginBottom: '0.8rem' }}>
            "{deletingStage.label}" has {dealCountByStage[deletingStage.key]} deal(s) on it. Move them to:
          </div>
          <select
            value={replacementKey}
            onChange={(e) => setReplacementKey(e.target.value)}
            style={{ ...fieldInputStyle, marginBottom: '0.8rem' }}
          >
            {stages.filter((s) => s.id !== deletingStage.id).map((s) => (
              <option key={s.id} value={s.key}>{s.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button style={primaryBtnStyle} disabled={busy} onClick={() => confirmDeleteWithReassign(deletingStage)}>
              Move and delete
            </button>
            <button style={ghostBtnStyle} onClick={() => setDeletingStage(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.2rem' }}>
        <label style={fieldLabelStyle}>Add a stage</label>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={fieldInputStyle} placeholder="e.g. Discovery Call" />
        <select value={newType} onChange={(e) => setNewType(e.target.value as StageType)} style={fieldInputStyle}>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <button style={primaryBtnStyle} disabled={busy} onClick={handleAdd}>Add stage</button>
      </div>
    </Modal>
  );
}
