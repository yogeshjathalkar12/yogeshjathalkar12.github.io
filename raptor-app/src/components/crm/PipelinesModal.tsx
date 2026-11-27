import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from './Modal';
import { type Pipeline, createPipeline } from '../../lib/pipelines';

// Add, rename and delete pipelines (the main one always exists).
export default function PipelinesModal({ open, pipelines, onClose, onChanged }: {
  open: boolean;
  pipelines: Pipeline[];
  onClose: () => void;
  onChanged: (select?: string) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(work: () => Promise<string | undefined>) {
    setBusy(true);
    setError('');
    try {
      await onChanged(await work());
    } catch (e: any) {
      setError(e.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const add = () => run(async () => {
    if (!name.trim()) throw new Error('Give the pipeline a name.');
    const id = await createPipeline(supabase, name, pipelines.length + 1);
    setName('');
    return id;
  });

  const rename = (p: Pipeline) => {
    const next = window.prompt('New name for this pipeline:', p.name)?.trim();
    if (!next || next === p.name) return;
    run(async () => { const { error: e } = await supabase.from('pipelines').update({ name: next.slice(0, 60) }).eq('id', p.id); if (e) throw e; return undefined; });
  };

  const remove = (p: Pipeline) => {
    if (!window.confirm(`Delete the pipeline "${p.name}" and its stages? It must have no deals in it.`)) return;
    run(async () => { const { error: e } = await supabase.from('pipelines').delete().eq('id', p.id); if (e) throw e; return ''; });
  };

  return (
    <Modal open={open} onClose={onClose} title="Pipelines" width={480}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
        Each pipeline has its own stages, for example one for new sales and one for renewals. "Main pipeline" is the one you already have.
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error}</div>}
      {pipelines.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '0.5rem 0', fontSize: '0.72rem' }}>
          <span style={{ flex: 1 }}>{p.name}</span>
          <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => rename(p)}>Rename</button>
          <button type="button" style={{ ...toolBtnStyle, color: 'var(--red)' }} disabled={busy} onClick={() => remove(p)}>Delete</button>
        </div>
      ))}
      <label style={{ ...fieldLabelStyle, marginTop: '1rem' }} htmlFor="new-pipeline">Add a pipeline</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="new-pipeline" style={{ ...fieldInputStyle, marginBottom: 0 }} value={name} maxLength={60} placeholder="e.g. Renewals" onChange={(e) => setName(e.target.value)} />
        <button type="button" style={toolPrimaryStyle} disabled={busy} onClick={add}>Add</button>
      </div>
    </Modal>
  );
}
