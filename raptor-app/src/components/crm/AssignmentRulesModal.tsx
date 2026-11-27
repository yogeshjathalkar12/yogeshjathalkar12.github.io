import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useDirectory } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { type AssignmentRule, FIELDS, OPS, describeAssignment, ruleDraftProblem } from '../../lib/assignment';
import Modal, { fieldLabelStyle, fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from './Modal';

// The rules that decide who a new website lead goes to.
export default function AssignmentRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { entries } = useDirectory();
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [field, setField] = useState('any');
  const [op, setOp] = useState('contains');
  const [value, setValue] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: failed } = await supabase.from('assignment_rules').select('*').order('position', { ascending: true });
    if (failed) setError(failed.message); else setRules((data || []) as AssignmentRule[]);
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const name = (id: string) => shortName(entries.find((e) => e.user_id === id)?.email || 'someone who left');

  async function run(work: () => PromiseLike<{ error: any }>) {
    setBusy(true);
    setError('');
    const { error: failed } = await work();
    setBusy(false);
    if (failed) setError(failed.message);
    await load();
    return !failed;
  }

  async function add() {
    const wrong = ruleDraftProblem(field, value, people);
    if (wrong) { setError(wrong); return; }
    const position = rules.reduce((max, r) => Math.max(max, r.position + 1), 0);
    if (await run(() => supabase.from('assignment_rules').insert({ field, op, value: field === 'any' ? '' : value.trim(), assignees: people, position }))) {
      setValue('');
      setPeople([]);
    }
  }

  // moving a rule up swaps its place with the one above
  async function up(i: number) {
    const a = rules[i - 1], b = rules[i];
    await run(async () => {
      const first = await supabase.from('assignment_rules').update({ position: a.position }).eq('id', b.id);
      if (first.error) return first;
      return supabase.from('assignment_rules').update({ position: a.position + 1 }).eq('id', a.id);
    });
  }

  const select = { ...fieldInputStyle, marginBottom: 8 };
  return (
    <Modal open={open} onClose={onClose} title="Assignment rules" width={540}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
        Used by themselves for new leads from your website forms. Tried from the top: the first match decides, and its people take turns.
        To use them on contacts you already have, select the contacts and press "Assign by rules".
      </div>
      {rules.length === 0 && <div style={{ fontSize: '0.65rem', color: 'var(--dim2)', marginBottom: 8 }}>No rules: each form's own "Who follows up" is used.</div>}
      {rules.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '0.45rem 0', fontSize: '0.7rem', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px' }}>{i + 1}. {describeAssignment(r, r.assignees.map(name))}</span>
          {i > 0 && <button type="button" style={toolBtnStyle} disabled={busy} aria-label={`Move rule ${i + 1} up`} onClick={() => up(i)}>↑</button>}
          <button type="button" style={toolBtnStyle} disabled={busy} aria-label={`Delete rule ${i + 1}`} onClick={() => run(() => supabase.from('assignment_rules').delete().eq('id', r.id))}>Delete</button>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}>
        <div style={fieldLabelStyle}>Add a rule</div>
        <select aria-label="When" style={select} value={field} onChange={(e) => setField(e.target.value)}>
          {FIELDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {field !== 'any' && (
          <>
            <select aria-label="Condition" style={select} value={op} onChange={(e) => setOp(e.target.value)}>
              {OPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <input aria-label="Value" style={select} value={value} maxLength={120} placeholder="e.g. .in" onChange={(e) => setValue(e.target.value)} />
          </>
        )}
        <div style={fieldLabelStyle}>Give it to (in turn)</div>
        {entries.map((m) => (
          <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', marginBottom: 6 }}>
            <input type="checkbox" checked={people.includes(m.user_id)} onChange={(e) => setPeople((p) => (e.target.checked ? [...p, m.user_id] : p.filter((x) => x !== m.user_id)))} />
            {shortName(m.email)}
          </label>
        ))}
        {error && <div style={{ color: 'var(--red)', fontSize: '0.62rem', marginBottom: 8 }}>{error}</div>}
        <button type="button" style={toolPrimaryStyle} disabled={busy} onClick={add}>Add rule</button>
      </div>
    </Modal>
  );
}
