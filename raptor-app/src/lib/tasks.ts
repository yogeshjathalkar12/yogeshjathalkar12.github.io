import { supabase } from './supabaseClient';

// Follow-up tasks (db/migrations/2026-10-05_*.sql). A task can be tied to a
// contact and/or a deal, has an optional due date and an assignee; who can
// see or change it follows the same rules as contacts and deals. Kept in sync
// by hand with the desktop app's pages/crm/tasks.js.

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  done_at: string | null;
  assignee_id: string | null;
  created_by: string | null;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
  contacts?: { name: string } | null;
  deals?: { title: string } | null;
}

export interface NewTask {
  title: string;
  notes?: string | null;
  due_at?: string | null;
  assignee_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
}

const SELECT = '*, contacts ( name ), deals ( title )';

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /relation .*tasks.* does not exist|could not find the table/i.test(err.message || ''));
}

/** Empty (not an error) when the tasks table hasn't been created yet. */
export async function loadTasks(filter?: { contactId?: string; dealId?: string }): Promise<Task[]> {
  let q = supabase.from('tasks').select(SELECT).order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (filter?.contactId) q = q.eq('contact_id', filter.contactId);
  if (filter?.dealId) q = q.eq('deal_id', filter.dealId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data || []) as Task[];
}

export async function createTask(t: NewTask): Promise<void> {
  const row: Record<string, unknown> = { title: t.title.trim(), notes: t.notes || null, due_at: t.due_at || null, contact_id: t.contact_id || null, deal_id: t.deal_id || null };
  if (t.assignee_id !== undefined) row.assignee_id = t.assignee_id; // omitted = the database assigns it to the creator
  const { error } = await supabase.from('tasks').insert(row);
  if (error) throw error;
}

export async function updateTask(id: string, t: Partial<NewTask>): Promise<void> {
  const { error } = await supabase.from('tasks').update(t).eq('id', id);
  if (error) throw error;
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export const isOverdue = (t: Task) => !t.done_at && !!t.due_at && new Date(t.due_at).getTime() < Date.now();

export const isDueToday = (t: Task) => {
  if (!t.due_at) return false;
  const d = new Date(t.due_at);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

/** <input type="datetime-local"> value <-> ISO timestamp */
export const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export function formatDue(iso: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
