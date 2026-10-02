import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/AuthContext';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { type Task, formatDue, isDueToday, isOverdue, loadTasks, setTaskDone } from '../../lib/tasks';
import TaskModal from '../../components/crm/TaskModal';
import AssigneeFilter, { applyAssigneeFilter, useAssigneeFilter } from '../../components/crm/AssigneeFilter';

type Tab = 'open' | 'today' | 'overdue' | 'done';
type View = 'list' | 'calendar';

interface Meeting { id: string; title: string; meeting_at: string }

const pill = (active: boolean): React.CSSProperties => ({
  padding: '0.45rem 0.9rem', fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 4, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent', color: active ? 'var(--white)' : 'var(--dim)', border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
});

export default function CrmTasks() {
  const { user } = useAuth();
  const { can } = useOrg();
  const { byId } = useDirectory();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useAssigneeFilter('tasks');
  const [editing, setEditing] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await loadTasks());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load tasks.');
    }
    // Deal meetings show on the calendar too. A missing column just means none.
    const { data } = await supabase.from('deals').select('id, title, meeting_at').not('meeting_at', 'is', null);
    setMeetings((data || []) as Meeting[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase.channel('crm-tasks-page').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // The notification bell links here with ?open=<task id>.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || tasks.length === 0) return;
    const match = tasks.find((t) => t.id === openId);
    if (match) setEditing(match);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const scoped = useMemo(() => applyAssigneeFilter(tasks, filter, user?.id), [tasks, filter, user]);
  const shown = useMemo(() => scoped.filter((t) => {
    if (tab === 'done') return !!t.done_at;
    if (t.done_at) return false;
    if (tab === 'overdue') return isOverdue(t);
    if (tab === 'today') return isDueToday(t);
    return true;
  }), [scoped, tab]);
  const counts = useMemo(() => ({
    overdue: scoped.filter(isOverdue).length,
    today: scoped.filter((t) => !t.done_at && isDueToday(t)).length,
  }), [scoped]);

  async function toggle(t: Task) {
    try { await setTaskDone(t.id, !t.done_at); load(); } catch (e: any) { setError(e.message || 'Could not update the task.'); }
  }

  const who = (id: string | null) => (id ? shortName(byId[id]?.email) + (byId[id]?.is_me ? ' (me)' : '') : 'Unassigned');

  // ---- calendar ----
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = useMemo(() => {
    const map: Record<string, { tasks: Task[]; meetings: Meeting[] }> = {};
    const slot = (k: string) => (map[k] = map[k] || { tasks: [], meetings: [] });
    scoped.forEach((t) => { if (t.due_at) slot(dayKey(new Date(t.due_at))).tasks.push(t); });
    meetings.forEach((m) => slot(dayKey(new Date(m.meeting_at))).meetings.push(m));
    return map;
  }, [scoped, meetings]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // week starts Monday
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const todayKey = dayKey(new Date());
  const picked = pickedDay ? byDay[pickedDay] : null;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading tasks…</div>;

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={pill(view === 'list')} onClick={() => setView('list')}>List</button>
          <button style={pill(view === 'calendar')} onClick={() => setView('calendar')}>Calendar</button>
          <AssigneeFilter value={filter} onChange={setFilter} />
        </div>
        {can('create') && (
          <button onClick={() => setShowNew(true)} style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            + New Task
          </button>
        )}
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      {view === 'list' ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button style={pill(tab === 'open')} onClick={() => setTab('open')}>To do</button>
            <button style={pill(tab === 'today')} onClick={() => setTab('today')}>Today{counts.today ? ` (${counts.today})` : ''}</button>
            <button style={{ ...pill(tab === 'overdue'), ...(counts.overdue && tab !== 'overdue' ? { color: 'var(--red)' } : {}) }} onClick={() => setTab('overdue')}>Overdue{counts.overdue ? ` (${counts.overdue})` : ''}</button>
            <button style={pill(tab === 'done')} onClick={() => setTab('done')}>Done</button>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
            {shown.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.75rem' }}>
                {tasks.length === 0 ? 'No tasks yet. Add a follow-up so nothing slips.' : tab === 'done' ? 'Nothing completed yet.' : 'Nothing here — you’re clear.'}
              </div>
            ) : shown.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <input type="checkbox" checked={!!t.done_at} onChange={() => toggle(t)} disabled={!can('edit')} style={{ cursor: 'pointer' }} />
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEditing(t)}>
                  <div style={{ fontSize: '0.78rem', color: t.done_at ? 'var(--dim2)' : 'var(--white)', textDecoration: t.done_at ? 'line-through' : 'none' }}>{t.title}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 3 }}>
                    {t.contacts?.name && <>Contact: {t.contacts.name} · </>}
                    {t.deals?.title && <>Deal: {t.deals.title} · </>}
                    {who(t.assignee_id)}
                  </div>
                </div>
                <div style={{ fontSize: '0.62rem', color: isOverdue(t) ? 'var(--red)' : 'var(--dim)', whiteSpace: 'nowrap' }}>{isOverdue(t) ? 'Overdue · ' : ''}{formatDue(t.due_at)}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <button style={pill(false)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '0.04em', minWidth: 170, textAlign: 'center' }}>
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <button style={pill(false)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
            <button style={pill(false)} onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} style={{ background: 'var(--surface2)', padding: '0.5rem', fontSize: '0.55rem', color: 'var(--dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} style={{ background: 'var(--surface)', minHeight: 78 }} />;
              const k = dayKey(d);
              const entry = byDay[k];
              const open = entry?.tasks.filter((t) => !t.done_at).length || 0;
              const done = entry?.tasks.filter((t) => t.done_at).length || 0;
              const meets = entry?.meetings.length || 0;
              return (
                <div key={k} onClick={() => setPickedDay(k === pickedDay ? null : k)} style={{ background: k === pickedDay ? 'var(--surface2)' : 'var(--surface)', minHeight: 78, padding: '0.4rem 0.5rem', cursor: 'pointer', outline: k === todayKey ? '1px solid var(--purple)' : 'none', outlineOffset: -1 }}>
                  <div style={{ fontSize: '0.65rem', color: k === todayKey ? 'var(--purple)' : 'var(--dim)' }}>{d.getDate()}</div>
                  {meets > 0 && <div style={{ fontSize: '0.55rem', color: 'var(--green)', marginTop: 3 }}>● {meets} meeting{meets > 1 ? 's' : ''}</div>}
                  {open > 0 && <div style={{ fontSize: '0.55rem', color: 'var(--white)', marginTop: 3 }}>● {open} to do</div>}
                  {done > 0 && <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginTop: 3 }}>✓ {done} done</div>}
                </div>
              );
            })}
          </div>
          {picked && (
            <div style={{ marginTop: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 1rem' }}>
              {picked.meetings.map((m) => (
                <div key={m.id} style={{ fontSize: '0.72rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', color: 'var(--green)' }}>
                  Meeting · {m.title} · {new Date(m.meeting_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </div>
              ))}
              {picked.tasks.map((t) => (
                <div key={t.id} onClick={() => setEditing(t)} style={{ fontSize: '0.72rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: t.done_at ? 'var(--dim2)' : 'var(--white)' }}>
                  {t.done_at ? '✓ ' : ''}{t.title} · {new Date(t.due_at!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {who(t.assignee_id)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <TaskModal open={showNew || !!editing} task={editing} onClose={() => { setShowNew(false); setEditing(null); }} onSaved={load} />
    </div>
  );
}
