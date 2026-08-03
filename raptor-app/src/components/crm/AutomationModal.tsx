import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { TRIGGER_LABELS, ACTION_LABELS, describeAutomation } from '../../lib/crmHelpers';

const TRIGGER_OPTIONS = Object.keys(TRIGGER_LABELS); // contact_no_reply, deal_stalled, deal_won
const ACTION_OPTIONS = Object.keys(ACTION_LABELS); // log_note, create_reminder, webhook

// deal_won fires immediately, no "days" component
const TRIGGERS_WITH_DAYS = new Set(['contact_no_reply', 'deal_stalled']);
// only these two actions use a free-text message; webhook uses a URL instead
const ACTIONS_WITH_MESSAGE = new Set(['log_note', 'create_reminder']);

interface AutomationModalProps {
  open: boolean;
  automation: any | null; // null = creating a new automation, otherwise editing
  onClose: () => void;
  onSaved: () => void;
}

export default function AutomationModal({ open, automation, onClose, onSaved }: AutomationModalProps) {
  const [triggerType, setTriggerType] = useState('contact_no_reply');
  const [triggerDays, setTriggerDays] = useState('3');
  const [actionType, setActionType] = useState('log_note');
  const [actionMessage, setActionMessage] = useState('');
  const [actionWebhookUrl, setActionWebhookUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (automation) {
        setTriggerType(automation.trigger_type || 'contact_no_reply');
        setTriggerDays(String(automation.trigger_days ?? 3));
        setActionType(automation.action_type || 'log_note');
        setActionMessage(automation.action_message || '');
        setActionWebhookUrl(automation.action_webhook_url || '');
        setEnabled(automation.enabled !== false);
      } else {
        setTriggerType('contact_no_reply');
        setTriggerDays('3');
        setActionType('log_note');
        setActionMessage('');
        setActionWebhookUrl('');
        setEnabled(true);
      }
      setError(null);
    }
  }, [open, automation]);

  const showDays = TRIGGERS_WITH_DAYS.has(triggerType);
  const showMessage = ACTIONS_WITH_MESSAGE.has(actionType);
  const showWebhook = actionType === 'webhook';

  // Live preview using the same describeAutomation() the automations list uses,
  // so the modal always matches how the rule will actually be rendered.
  const preview = describeAutomation({
    trigger_type: triggerType,
    trigger_days: Number(triggerDays) || 0,
    action_type: actionType,
    action_message: actionMessage,
    action_webhook_url: actionWebhookUrl,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (showMessage && !actionMessage.trim()) {
      setError('Add a message for this action.');
      return;
    }
    if (showWebhook && !actionWebhookUrl.trim()) {
      setError('Add a webhook URL for this action.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        trigger_type: triggerType,
        trigger_days: showDays ? Number(triggerDays) || 0 : 0,
        action_type: actionType,
        action_message: showMessage ? actionMessage.trim() : null,
        action_webhook_url: showWebhook ? actionWebhookUrl.trim() : null,
        enabled,
      };

      if (automation?.id) {
        const { error: updateErr } = await supabase.from('automations').update(payload).eq('id', automation.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('automations').insert(payload);
        if (insertErr) throw insertErr;
      }

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
      <form onSubmit={handleSubmit}>
        <label style={fieldLabelStyle}>When…</label>
        <select style={fieldInputStyle} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
          {TRIGGER_OPTIONS.map((key) => (
            <option key={key} value={key}>{TRIGGER_LABELS[key](Number(triggerDays) || 0)}</option>
          ))}
        </select>

        {showDays && (
          <>
            <label style={fieldLabelStyle}>Days</label>
            <input
              style={fieldInputStyle}
              type="number"
              min="1"
              value={triggerDays}
              onChange={(e) => setTriggerDays(e.target.value)}
            />
          </>
        )}

        <label style={fieldLabelStyle}>Then…</label>
        <select style={fieldInputStyle} value={actionType} onChange={(e) => setActionType(e.target.value)}>
          {ACTION_OPTIONS.map((key) => (
            <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {showMessage && (
          <>
            <label style={fieldLabelStyle}>Message</label>
            <input
              style={fieldInputStyle}
              value={actionMessage}
              onChange={(e) => setActionMessage(e.target.value)}
              placeholder="e.g. Follow up — no response in a while"
            />
          </>
        )}

        {showWebhook && (
          <>
            <label style={fieldLabelStyle}>Webhook URL</label>
            <input
              style={fieldInputStyle}
              value={actionWebhookUrl}
              onChange={(e) => setActionWebhookUrl(e.target.value)}
              placeholder="https://…"
            />
          </>
        )}

        <label style={{ ...fieldLabelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>

        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '0.8rem 1rem', fontSize: '0.65rem', color: 'var(--dim)', margin: '0.4rem 0 1.1rem',
        }}>
          When <strong style={{ color: 'var(--white)' }}>{preview.when}</strong>, {preview.then}.
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

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