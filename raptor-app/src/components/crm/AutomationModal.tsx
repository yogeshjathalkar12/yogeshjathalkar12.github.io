import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import {
  ACTION_NAMES, ACTIONS_WITH_MESSAGE, NEW_TRIGGERS, OLD_TRIGGERS, SCORE_TRIGGER, STATUSES, TRIGGER_NAMES,
  actionsFor, conditionsFor, describeRule, draftOf, emptyDraft, leastDays, problemWith, ruleRow, showsDays, withTrigger,
  type RuleDraft,
} from '../../lib/automationRules';

interface AutomationModalProps {
  open: boolean;
  automation: any | null; // null = creating a new automation, otherwise editing
  installed: boolean;     // 2026-11-28_k_automations.sql has been run: the newer choices can be saved
  scoring: boolean;       // 2026-11-29_c_score_trigger.sql has been run: a rule can start from the lead score
  stages: [string, string][];
  people: [string, string][];
  onClose: () => void;
  onSaved: () => void;
}

const noteStyle: React.CSSProperties = { fontSize: '0.6rem', color: 'var(--dim)', margin: '-0.5rem 0 0.9rem' };

export default function AutomationModal({ open, automation, installed, scoring, stages, people, onClose, onSaved }: AutomationModalProps) {
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(automation ? draftOf(automation) : emptyDraft());
      setError(null);
    }
  }, [open, automation]);

  const set = (change: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...change }));
  const triggers = installed ? [...OLD_TRIGGERS, ...NEW_TRIGGERS, ...(scoring ? [SCORE_TRIGGER] : [])] : OLD_TRIGGERS;
  const actions = actionsFor(draft.trigger, installed);
  const conditions = installed ? conditionsFor(draft.trigger) : [];

  // The same words the automations list uses, so the window always matches how the rule will be shown.
  const preview = describeRule(ruleRow(draft, installed), { stages: Object.fromEntries(stages), people: Object.fromEntries(people) });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = problemWith(draft);
    setError(problem);
    if (problem) return;

    setSaving(true);
    try {
      const payload = ruleRow(draft, installed);
      const { error: saveErr } = automation?.id
        ? await supabase.from('automations').update(payload).eq('id', automation.id)
        : await supabase.from('automations').insert(payload);
      if (saveErr) throw saveErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save automation:', err);
      setError(err.message || 'Could not save this automation.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!automation?.id) return;
    if (!confirm('Delete this automation? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      const { error: deleteErr } = await supabase.from('automations').delete().eq('id', automation.id);
      if (deleteErr) throw deleteErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete automation:', err);
      setError(err.message || 'Could not delete this automation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={automation ? 'Edit Automation' : 'New Automation'}>
      <form onSubmit={handleSubmit} noValidate>
        <label style={fieldLabelStyle} htmlFor="rule-when">When…</label>
        <select id="rule-when" style={fieldInputStyle} value={draft.trigger} onChange={(e) => setDraft((d) => withTrigger(d, e.target.value, installed))}>
          {triggers.map((key) => <option key={key} value={key}>{TRIGGER_NAMES[key]}</option>)}
        </select>

        {draft.trigger === 'deal_in_stage' && (
          <>
            <label style={fieldLabelStyle} htmlFor="rule-stage">Stage</label>
            <select id="rule-stage" style={fieldInputStyle} value={draft.stage} onChange={(e) => set({ stage: e.target.value })}>
              <option value="">Choose a stage</option>
              {draft.stage && !stages.some(([k]) => k === draft.stage) && <option value={draft.stage}>A stage that no longer exists</option>}
              {stages.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </>
        )}

        {draft.trigger === SCORE_TRIGGER && (
          <>
            <label style={fieldLabelStyle} htmlFor="rule-score">Score</label>
            <input id="rule-score" style={fieldInputStyle} type="number" value={draft.score} placeholder="e.g. 50" onChange={(e) => set({ score: e.target.value })} />
            <div style={noteStyle}>Your scoring rules (Contacts → Scoring rules) work out the score. It acts once for each contact that newly reaches it; those already there when the rule starts are left alone.</div>
          </>
        )}

        {showsDays(draft.trigger) && (
          <>
            <label style={fieldLabelStyle} htmlFor="rule-days">{draft.trigger === 'deal_in_stage' ? 'Days in that stage' : NEW_TRIGGERS.includes(draft.trigger) ? 'Days to wait' : 'Days'}</label>
            <input id="rule-days" style={fieldInputStyle} type="number" min={leastDays(draft.trigger)} value={draft.days} onChange={(e) => set({ days: e.target.value })} />
          </>
        )}
        {NEW_TRIGGERS.includes(draft.trigger) && (
          <div style={noteStyle}>0 days means at the next run. It acts once for each record, and only on what happens after the rule is made or switched on again.</div>
        )}

        {conditions.length > 0 && <div style={fieldLabelStyle}>Only if… (optional)</div>}
        {conditions.includes('min_value') && (
          <input style={fieldInputStyle} type="number" min="0" aria-label="Worth at least" placeholder="Deal is worth at least" value={draft.minValue} onChange={(e) => set({ minValue: e.target.value })} />
        )}
        {conditions.includes('status') && (
          <select style={fieldInputStyle} aria-label="Status is" value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>
            {STATUSES.map(([key, label]) => <option key={key} value={key}>Status is {label}</option>)}
          </select>
        )}
        {conditions.includes('tag') && (
          <input style={fieldInputStyle} aria-label="Has the tag" placeholder="Has the tag" maxLength={40} value={draft.tag} onChange={(e) => set({ tag: e.target.value })} />
        )}

        <label style={fieldLabelStyle} htmlFor="rule-then">Then…</label>
        <select id="rule-then" style={fieldInputStyle} value={draft.action} onChange={(e) => set({ action: e.target.value, value: '' })}>
          {actions.map((key) => <option key={key} value={key}>{ACTION_NAMES[key]}</option>)}
        </select>

        {draft.action === 'assign' && (
          <select style={fieldInputStyle} aria-label="Person" value={draft.value} onChange={(e) => set({ value: e.target.value })}>
            <option value="">Choose a person</option>
            {draft.value && !people.some(([k]) => k === draft.value) && <option value={draft.value}>Someone you cannot see or who left</option>}
            {people.map(([id, email]) => <option key={id} value={id}>{email}</option>)}
          </select>
        )}
        {draft.action === 'set_status' && (
          <select style={fieldInputStyle} aria-label="New status" value={draft.value} onChange={(e) => set({ value: e.target.value })}>
            <option value="">Choose a status</option>
            {STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
        {draft.action === 'add_tag' && (
          <input style={fieldInputStyle} aria-label="Tag to add" placeholder="Tag to add" maxLength={40} value={draft.value} onChange={(e) => set({ value: e.target.value })} />
        )}

        {ACTIONS_WITH_MESSAGE.includes(draft.action) && (
          <>
            <label style={fieldLabelStyle} htmlFor="rule-message">Message</label>
            <input id="rule-message" style={fieldInputStyle} value={draft.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. Follow up — no response in a while" />
          </>
        )}

        {draft.action === 'webhook' && (
          <>
            <label style={fieldLabelStyle} htmlFor="rule-webhook">Webhook URL</label>
            <input id="rule-webhook" style={fieldInputStyle} value={draft.webhook} onChange={(e) => set({ webhook: e.target.value })} placeholder="https://…" />
          </>
        )}

        <label style={{ ...fieldLabelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Enabled
        </label>

        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '0.8rem 1rem', fontSize: '0.65rem', color: 'var(--dim)', margin: '0.4rem 0 1.1rem', overflowWrap: 'anywhere',
        }}>
          When <strong style={{ color: 'var(--white)' }}>{preview.when}</strong>, {preview.then}.
        </div>

        {error && <div role="alert" style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
          {automation?.id && (
            <button
              type="button"
              style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)', flex: '0 0 auto' }}
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={saving}>
            {saving ? 'Saving…' : automation ? 'Save Changes' : 'Create Automation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
