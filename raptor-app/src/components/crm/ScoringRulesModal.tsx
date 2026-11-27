import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from './Modal';
import { OPS, SCORE_FIELDS, type ScoreOp, type ScoreRule, describeRule, fieldKind, needsValue } from '../../lib/scoring';
import type { CustomFieldDef } from '../../lib/customFields';

// The lead scoring rules of the organization.
export default function ScoringRulesModal({ open, rules, defs, onClose, onChanged }: {
  open: boolean;
  rules: ScoreRule[];
  defs: CustomFieldDef[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [field, setField] = useState('job_title');
  const [op, setOp] = useState<ScoreOp>('contains');
  const [value, setValue] = useState('');
  const [points, setPoints] = useState('10');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fields = [...SCORE_FIELDS.map((f) => [f.id, f.label] as [string, string]), ...defs.map((d) => [`cf:${d.id}`, d.name] as [string, string])];
  const label = (id: string) => fields.find(([f]) => f === id)?.[1] ?? 'a deleted field';

  async function add() {
    const n = Math.round(Number(points));
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100) { setError('Points: a whole number from -100 to 100, not 0.'); return; }
    if (needsValue(op) && !value.trim()) { setError('Say what to compare with.'); return; }
    setBusy(true);
    setError('');
    const { error: failed } = await supabase.from('lead_score_rules').insert({ field, op, value: needsValue(op) ? value.trim() : '', points: n });
    setBusy(false);
    if (failed) { setError(failed.message); return; }
    setValue('');
    await onChanged();
  }

  async function remove(id: string) {
    const { error: failed } = await supabase.from('lead_score_rules').delete().eq('id', id);
    if (failed) { setError(failed.message); return; }
    await onChanged();
  }

  const select = { ...fieldInputStyle, marginBottom: 8 };
  return (
    <Modal open={open} onClose={onClose} title="Lead scoring" width={520}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
        A contact's score is the sum of the rules it matches. Add the "Score" column in the contacts list to sort by it.
      </div>
      {rules.length === 0 && <div style={{ fontSize: '0.65rem', color: 'var(--dim2)', marginBottom: 8 }}>No rules yet.</div>}
      {rules.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '0.45rem 0', fontSize: '0.7rem' }}>
          <span style={{ flex: 1, color: r.points < 0 ? 'var(--red)' : 'var(--white)' }}>{describeRule(r, label(r.field))}</span>
          <button type="button" style={toolBtnStyle} aria-label={`Delete the rule ${describeRule(r, label(r.field))}`} onClick={() => remove(r.id)}>Delete</button>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}>
        <div style={fieldLabelStyle}>Add a rule</div>
        <select aria-label="Field" style={select} value={field} onChange={(e) => { setField(e.target.value); setOp(OPS[fieldKind(e.target.value)][0][0]); }}>
          {fields.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Condition" style={select} value={op} onChange={(e) => setOp(e.target.value as ScoreOp)}>
          {OPS[fieldKind(field)].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {needsValue(op) && <input aria-label="Value" style={select} value={value} maxLength={120} placeholder={fieldKind(field) === 'number' ? 'e.g. 30' : 'e.g. director'} onChange={(e) => setValue(e.target.value)} />}
        <label style={fieldLabelStyle} htmlFor="rule-points">Points (negative to take away)</label>
        <input id="rule-points" type="number" style={select} value={points} min={-100} max={100} onChange={(e) => setPoints(e.target.value)} />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.62rem', marginBottom: 8 }}>{error}</div>}
        <button type="button" style={toolPrimaryStyle} disabled={busy} onClick={add}>Add rule</button>
      </div>
    </Modal>
  );
}
