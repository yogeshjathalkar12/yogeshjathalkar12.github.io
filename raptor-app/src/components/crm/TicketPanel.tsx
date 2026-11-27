import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory, useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { dueLabel, fromLocalInput, isOverdueTicket, toLocalInput } from '../../lib/tickets';
import Modal, { fieldInputStyle, fieldLabelStyle, ghostBtnStyle, primaryBtnStyle, toolBtnStyle } from './Modal';

// One ticket: who has it, when it is due, and the team's notes.

interface Note { id: string; body: string; created_by: string | null; created_at: string }

export default function TicketPanel({ ticket, onClose, onChanged }: { ticket: any | null; onClose: () => void; onChanged: () => void }) {
  const { isOwner, isAdmin, can } = useOrg();
  const { entries } = useDirectory();
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', status: 'open', assignee_id: '', due: '' });
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const names = useMemberLabels(notes.map((n) => n.created_by));
  const me = entries.find((e) => e.is_me)?.user_id;

  async function loadNotes(id: string) {
    const { data, error: failed } = await supabase.from('ticket_notes').select('id, body, created_by, created_at').eq('ticket_id', id).order('created_at', { ascending: true });
    if (failed) { setError(failed.message); return; }
    setNotes((data || []) as Note[]);
  }

  useEffect(() => {
    if (!ticket) return;
    setForm({ title: ticket.title || '', description: ticket.description || '', priority: ticket.priority || 'medium', status: ticket.status || 'open', assignee_id: ticket.assignee_id || '', due: toLocalInput(ticket.due_at) });
    setText(''); setError(''); setNotes([]);
    loadNotes(ticket.id);
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket) return null;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!form.title.trim()) { setError('Give the ticket a subject.'); return; }
    setBusy(true); setError('');
    const row: Record<string, unknown> = { title: form.title.trim(), description: form.description.trim(), priority: form.priority, status: form.status, assignee_id: form.assignee_id || null };
    // the due time is sent only when the person changed it: otherwise a new priority sets it
    if (form.due !== toLocalInput(ticket.due_at)) row.due_at = fromLocalInput(form.due);
    const { error: failed } = await supabase.from('tickets').update(row).eq('id', ticket.id);
    setBusy(false);
    if (failed) { setError(failed.message); return; }
    onChanged();
    onClose();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    const { error: failed } = await supabase.from('ticket_notes').insert({ ticket_id: ticket.id, body: text.trim() });
    setBusy(false);
    if (failed) { setError(failed.message); return; }
    setText('');
    loadNotes(ticket.id);
  }

  async function removeNote(id: string) {
    if (!confirm('Delete this note?')) return;
    const { error: failed } = await supabase.from('ticket_notes').delete().eq('id', id);
    if (failed) setError(failed.message);
    loadNotes(ticket.id);
  }

  async function removeTicket() {
    if (!confirm('Delete this ticket and its notes? This cannot be undone.')) return;
    const { error: failed } = await supabase.from('tickets').delete().eq('id', ticket.id);
    if (failed) { setError(failed.message); return; }
    onChanged();
    onClose();
  }

  const editable = can('edit');

  return (
    <Modal open onClose={onClose} title="Ticket" width={600}>
      <div style={{ fontSize: '0.65rem', color: isOverdueTicket(ticket) ? 'var(--red)' : 'var(--dim)', marginBottom: 12 }}>
        {ticket.contacts?.name ? <>For <a style={{ color: 'var(--purple)' }} href={`#/crm/contacts?open=${ticket.contacts.id}`}>{ticket.contacts.name}</a> · </> : null}
        opened {new Date(ticket.created_at).toLocaleString()} · {dueLabel(ticket)}
      </div>
      <label style={fieldLabelStyle} htmlFor="t-title">Subject</label>
      <input id="t-title" style={fieldInputStyle} value={form.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} />
      <label style={fieldLabelStyle} htmlFor="t-desc">Description</label>
      <textarea id="t-desc" style={{ ...fieldInputStyle, minHeight: 70 }} value={form.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', columnGap: 12 }}>
        <div><label style={fieldLabelStyle} htmlFor="t-status">Status</label>
          <select id="t-status" style={fieldInputStyle} value={form.status} disabled={!editable} onChange={(e) => set({ status: e.target.value })}>
            <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select></div>
        <div><label style={fieldLabelStyle} htmlFor="t-priority">Priority</label>
          <select id="t-priority" style={fieldInputStyle} value={form.priority} disabled={!editable} onChange={(e) => set({ priority: e.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select></div>
        <div><label style={fieldLabelStyle} htmlFor="t-who">Handled by</label>
          <select id="t-who" style={fieldInputStyle} value={form.assignee_id} disabled={!editable} onChange={(e) => set({ assignee_id: e.target.value })}>
            <option value="">Nobody yet</option>
            {form.assignee_id && !entries.some((m) => m.user_id === form.assignee_id) && <option value={form.assignee_id}>Someone else</option>}
            {entries.map((m) => <option key={m.user_id} value={m.user_id}>{shortName(m.email)}{m.is_me ? ' (me)' : ''}</option>)}
          </select></div>
        <div><label style={fieldLabelStyle} htmlFor="t-due">Due</label>
          <input id="t-due" style={fieldInputStyle} type="datetime-local" value={form.due} disabled={!editable} onChange={(e) => set({ due: e.target.value })} /></div>
      </div>

      <div style={{ ...fieldLabelStyle, marginTop: 6 }}>Notes (your team only; the customer does not see them)</div>
      {notes.length === 0 && <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: 8 }}>No notes yet.</div>}
      {notes.map((n) => (
        <div key={n.id} style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 0', fontSize: '0.7rem', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</div>
            <div style={{ color: 'var(--dim)', fontSize: '0.58rem' }}>{shortName(n.created_by ? names[n.created_by] : '')} · {new Date(n.created_at).toLocaleString()}</div>
          </div>
          {(n.created_by === me || isOwner || isAdmin) && <button type="button" style={toolBtnStyle} aria-label="Delete note" onClick={() => removeNote(n.id)}>✕</button>}
        </div>
      ))}
      <form onSubmit={addNote} style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}>
        <textarea aria-label="New note" style={{ ...fieldInputStyle, marginBottom: 0, minHeight: 40, flex: 1 }} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" style={toolBtnStyle} disabled={busy || !text.trim()}>Add note</button>
      </form>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {can('delete') && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={removeTicket}>Delete</button>}
        <button type="button" style={ghostBtnStyle} onClick={onClose}>Close</button>
        {editable && <button type="button" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={busy} onClick={save}>Save ticket</button>}
      </div>
    </Modal>
  );
}
