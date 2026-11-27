// lib/assignment.ts
// Words for the assignment rules (db/migrations/2026-11-28_j_assignment_rules.sql). The database does the matching.

export interface AssignmentRule { id: string; field: string; op: string; value: string; assignees: string[]; position: number; enabled: boolean }

export const FIELDS: [string, string][] = [
  ['any', 'Any new lead'], ['email', 'Email'], ['company', 'Company'], ['job_title', 'Job title'], ['phone', 'Phone'], ['form', 'Website form name'], ['message', 'Message'],
];
export const OPS: [string, string][] = [['contains', 'contains'], ['is', 'is'], ['ends', 'ends with']];

export function ruleDraftProblem(field: string, value: string, assignees: string[]): string | null {
  if (field !== 'any' && !value.trim()) return 'Say what to look for.';
  if (assignees.length === 0) return 'Tick at least one person.';
  if (assignees.length > 50) return 'A rule can have 50 people at most.';
  return null;
}

export function describeAssignment(rule: Pick<AssignmentRule, 'field' | 'op' | 'value'>, names: string[]): string {
  const field = FIELDS.find(([id]) => id === rule.field)?.[1] ?? rule.field;
  const when = rule.field === 'any' ? 'Any new lead' : `${field} ${OPS.find(([id]) => id === rule.op)?.[1] ?? rule.op} "${rule.value}"`;
  return `${when} → ${names.join(', ')}${names.length > 1 ? ' in turn' : ''}`;
}
