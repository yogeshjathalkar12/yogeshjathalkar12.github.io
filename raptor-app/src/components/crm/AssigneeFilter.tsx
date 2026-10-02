import { useState } from 'react';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';

export type AssigneeFilterValue = string; // 'all' | 'mine' | 'unassigned' | 'user:<id>'

/** Remembers the last choice per page, per browser. */
export function useAssigneeFilter(pageKey: string): [AssigneeFilterValue, (v: AssigneeFilterValue) => void] {
  const storageKey = `raptor_assignee_filter_${pageKey}`;
  const [value, setValue] = useState<AssigneeFilterValue>(() => {
    try { return localStorage.getItem(storageKey) || 'all'; } catch { return 'all'; }
  });
  const set = (v: AssigneeFilterValue) => {
    setValue(v);
    try { localStorage.setItem(storageKey, v); } catch { /* storage unavailable - just not remembered */ }
  };
  return [value, set];
}

/** The "My / My team / Everyone / one person" view switch. This only narrows
 *  what's shown on screen - what a person is ALLOWED to see is decided in the
 *  database, so a manager flipping to "Only mine" loses no access. */
export function applyAssigneeFilter<T extends { assignee_id?: string | null }>(rows: T[], filter: AssigneeFilterValue, myId: string | null | undefined): T[] {
  if (filter === 'mine') return rows.filter((r) => r.assignee_id === myId);
  if (filter === 'unassigned') return rows.filter((r) => !r.assignee_id);
  if (filter.startsWith('user:')) return rows.filter((r) => r.assignee_id === filter.slice(5));
  return rows;
}

interface AssigneeFilterProps {
  value: AssigneeFilterValue;
  onChange: (v: AssigneeFilterValue) => void;
}

export default function AssigneeFilter({ value, onChange }: AssigneeFilterProps) {
  const { entries, others } = useDirectory();
  const { isOwner, can } = useOrg();
  const seesAll = isOwner || can('view_all');

  // Nothing to switch between for someone who only ever sees themselves.
  if (entries.length <= 1) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Whose records to show"
      style={{
        padding: '0.6rem 0.9rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)',
        fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: '4px', letterSpacing: '0.04em',
      }}
    >
      <option value="all">{seesAll ? 'Everyone' : 'My team'}</option>
      <option value="mine">Only mine</option>
      {seesAll && <option value="unassigned">Unassigned</option>}
      {others.map((o) => (
        <option key={o.user_id} value={`user:${o.user_id}`}>Assigned to {shortName(o.email)}</option>
      ))}
    </select>
  );
}
