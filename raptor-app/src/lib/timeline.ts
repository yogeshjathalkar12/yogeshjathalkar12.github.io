// lib/timeline.ts
// The activity of a deal or a company, gathered from several places (db/migrations/2026-11-28_d_record_activity.sql).
//   a deal:    lines written on the deal, and the history of the person on it
//   a company: lines written on the company, on its deals, and on its people

export interface ActivityLine { id: string; type: string; content: string; created_at: string; direction?: string | null; contact_id?: string | null; deal_id?: string | null; company_id?: string | null }

/** One list from several: each line once, newest first. */
export function mergeActivity(...lists: ActivityLine[][]): ActivityLine[] {
  const byId = new Map<string, ActivityLine>();
  for (const list of lists) for (const line of list) byId.set(line.id, line);
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : 1));
}

export function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Where a line was written, when that is not the record being looked at: "Asha" or "Deal: Pilot". */
export function whereFrom(line: ActivityLine, here: { dealId?: string; companyId?: string }, names: { contacts: Record<string, string>; deals: Record<string, string> }): string {
  if (line.deal_id && line.deal_id !== here.dealId && names.deals[line.deal_id]) return `Deal: ${names.deals[line.deal_id]}`;
  if (line.contact_id && names.contacts[line.contact_id]) return names.contacts[line.contact_id];
  return '';
}

/** The columns of a new line written on a deal or on a company. */
export function newLine(type: string, content: string, here: { dealId?: string; companyId?: string; contactId?: string | null }) {
  return {
    type, content: content.trim(),
    ...(here.dealId ? { deal_id: here.dealId, contact_id: here.contactId || null } : {}),
    ...(here.companyId && !here.dealId ? { company_id: here.companyId } : {}),
  };
}
