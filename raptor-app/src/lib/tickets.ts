// Support tickets (db/migrations/2026-11-29_h_helpdesk.sql adds the person, the due time and notes).

export interface TicketLike { status: string; due_at?: string | null; assignee_id?: string | null }
export type TicketView = 'all' | 'mine' | 'overdue';

export const isDone = (t: TicketLike) => t.status === 'resolved' || t.status === 'closed';
export const isOverdueTicket = (t: TicketLike, now: number = Date.now()) => !isDone(t) && !!t.due_at && Date.parse(t.due_at) < now;

/** "Due in 3 hours", "Overdue by 2 days"; a dash when there is no due time or the ticket is finished. */
export function dueLabel(t: TicketLike, now: number = Date.now()): string {
  if (isDone(t) || !t.due_at) return '—';
  const gap = Date.parse(t.due_at) - now;
  if (!Number.isFinite(gap)) return '—';
  const minutes = Math.abs(gap) / 60_000;
  const [n, unit] = minutes < 90 ? [Math.max(1, Math.round(minutes)), 'minute'] : minutes < 36 * 60 ? [Math.round(minutes / 60), 'hour'] : [Math.round(minutes / 1440), 'day'];
  const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return gap < 0 ? `Overdue by ${text}` : `Due in ${text}`;
}

export function inView(t: TicketLike, view: TicketView, userId: string | undefined, now: number = Date.now()): boolean {
  if (view === 'mine') return !!userId && t.assignee_id === userId;
  if (view === 'overdue') return isOverdueTicket(t, now);
  return true;
}

/** A due time for the date-and-time box, and back. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}
export const fromLocalInput = (text: string): string | null => (text && !Number.isNaN(new Date(text).getTime()) ? new Date(text).toISOString() : null);
