import { useEffect, useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { supabase } from '../../lib/supabaseClient';
import { useDirectory } from '../../hooks/useDirectory';
import { useOrg } from '../../hooks/OrgContext';
import { shortName } from '../../lib/team';
import { type Task, createTask, deleteTask, fromLocalInput, toLocalInput, updateTask } from '../../lib/tasks';

interface TaskModalProps {
  open: boolean;
  /** Existing task to edit, or null to create. */
  task: Task | null;
  /** Pre-fill when created from a contact/deal panel. */
  defaults?: { contact_id?: string; deal_id?: string };
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskModal({ open, task, defaults, onClose, onSaved }: TaskModalProps) {
  const { entries } = useDirectory();
  const { can } = useOrg();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState('');
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = entries.filter((e) => e.can_assign);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title || '');
    setNotes(task?.notes || '');
    setDue(toLocalInput(task?.due_at || null));
    setAssignee(task ? task.assignee_id || '' : (entries.find((e) => e.is_me)?.user_id || ''));
    setContactId(task?.contact_id || defaults?.contact_id || '');
    setDealId(task?.deal_id || defaults?.deal_id || '');
    setError(null);
    Promise.all([
      supabase.from('contacts').select('id, name').order('name').limit(500),
      supabase.from('deals').select('id, title').order('title').limit(500),
    ]).then(([c, d]) => { setContacts(c.data || []); setDeals(d.data || []); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the task a title.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { title, notes: notes || null, due_at: fromLocalInput(due), contact_id: contactId || null, deal_id: dealId || null };
      if (task) {
        await updateTask(task.id, { ...payload, ...(assignee !== (task.assignee_id || '') ? { assignee_id: assignee || null } : {}) });
      } else {
        await createTask({ ...payload, ...(assignee ? { assignee_id: assignee } : {}) });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save the task.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task || !window.confirm('Delete this task?')) return;
    try { await deleteTask(task.id); onSaved(); onClose(); } catch (err: any) { setError(err.message || 'Could not delete the task.'); }
  }

  const readOnly = !!task && !can('edit');

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Task' : 'New task'} width={480}>
      <form onSubmit={handleSave}>
        <label style={fieldLabelStyle}>What needs doing</label>
        <input style={fieldInputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send the proposal to Priya" autoFocus disabled={readOnly} />
        <label style={fieldLabelStyle}>Due</label>
        <input style={fieldInputStyle} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} disabled={readOnly} />
        {people.length > 1 && (
          <>
            <label style={fieldLabelStyle}>Assigned to</label>
            <select style={fieldInputStyle} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={readOnly}>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{shortName(p.email)}{p.is_me ? ' (me)' : ''}</option>)}
            </select>
          </>
        )}
        <label style={fieldLabelStyle}>Contact (optional)</label>
        <select style={fieldInputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={readOnly}>
          <option value="">None</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label style={fieldLabelStyle}>Deal (optional)</label>
        <select style={fieldInputStyle} value={dealId} onChange={(e) => setDealId(e.target.value)} disabled={readOnly}>
          <option value="">None</option>
          {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <label style={fieldLabelStyle}>Notes</label>
        <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.7rem' }}>
          {task && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }} onClick={handleDelete}>Delete</button>}
          <button type="button" style={ghostBtnStyle} onClick={onClose}>Close</button>
          {!readOnly && <button type="submit" style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
        </div>
      </form>
    </Modal>
  );
}
