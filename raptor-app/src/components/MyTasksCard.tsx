import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { type Task, formatDue, isDueToday, isOverdue, loadTasks, setTaskDone } from '../lib/tasks';

// Dashboard card: what's on my plate today - overdue first, then due today.
export default function MyTasksCard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  async function load() {
    try {
      const all = await loadTasks();
      setTasks(all.filter((t) => !t.done_at && t.assignee_id === user?.id && (isOverdue(t) || isDueToday(t))));
    } catch { setTasks([]); }
  }
  useEffect(() => { if (user) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  if (!tasks || tasks.length === 0) return null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '2rem', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold' }}>My tasks for today</div>
        <Link to="/crm/tasks" style={{ fontSize: '0.6rem', color: 'var(--purple)', textDecoration: 'none' }}>All tasks →</Link>
      </div>
      {tasks.slice(0, 6).map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.35rem 0' }}>
          <input type="checkbox" onChange={async () => { await setTaskDone(t.id, true).catch(() => {}); load(); }} />
          <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--white)' }}>{t.title}</span>
          <span style={{ fontSize: '0.58rem', color: isOverdue(t) ? 'var(--red)' : 'var(--dim)' }}>{isOverdue(t) ? 'Overdue · ' : ''}{formatDue(t.due_at)}</span>
        </div>
      ))}
      {tasks.length > 6 && <div style={{ fontSize: '0.58rem', color: 'var(--dim)', marginTop: 4 }}>+ {tasks.length - 6} more</div>}
    </div>
  );
}
