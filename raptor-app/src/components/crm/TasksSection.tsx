import { useCallback, useEffect, useState } from 'react';
import { useOrg } from '../../hooks/OrgContext';
import { type Task, formatDue, isOverdue, loadTasks, setTaskDone } from '../../lib/tasks';
import { fieldLabelStyle } from './Modal';
import TaskModal from './TaskModal';

// The follow-ups tied to one contact or deal, shown inside its panel.
export default function TasksSection({ contactId, dealId }: { contactId?: string; dealId?: string }) {
  const { can } = useOrg();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await loadTasks({ contactId, dealId })); } catch { setTasks([]); }
  }, [contactId, dealId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(t: Task) {
    try { await setTaskDone(t.id, !t.done_at); load(); } catch { /* the row stays as it was */ }
  }

  return (
    <div style={{ marginTop: '1.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>Tasks</label>
        {can('create') && (
          <button type="button" onClick={() => setShowNew(true)} style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem' }}>+ Add task</button>
        )}
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: '0.62rem', color: 'var(--dim2)' }}>No tasks yet.</div>
      ) : tasks.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0' }}>
          <input type="checkbox" checked={!!t.done_at} onChange={() => toggle(t)} disabled={!can('edit')} />
          <span onClick={() => setEditing(t)} style={{ flex: 1, fontSize: '0.68rem', cursor: 'pointer', color: t.done_at ? 'var(--dim2)' : 'var(--white)', textDecoration: t.done_at ? 'line-through' : 'none' }}>{t.title}</span>
          <span style={{ fontSize: '0.55rem', color: isOverdue(t) ? 'var(--red)' : 'var(--dim)' }}>{formatDue(t.due_at)}</span>
        </div>
      ))}
      <TaskModal open={showNew || !!editing} task={editing} defaults={{ contact_id: contactId, deal_id: dealId }} onClose={() => { setShowNew(false); setEditing(null); }} onSaved={load} />
    </div>
  );
}
