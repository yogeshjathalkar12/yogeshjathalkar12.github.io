// More than one sending mailbox needs Shoonya's approval (db: 2026-12-03_c_feature_approvals and 2026-12-04_a_web_mailbox_gate). The
// database and the server enforce it; these rules only decide what the screen says. A database without them means no rule at all.
export interface MailboxApproval {
  status: 'none' | 'pending' | 'approved' | 'active' | 'revoked' | 'expired';
  max_mailboxes?: number;
  org_daily_cap?: number;
}
export interface MailboxRow { id: string; from_email: string; created_at: string; pool_exempt?: boolean }

const address = (value: string) => value.trim().toLowerCase();

// the different addresses connected, the earliest first
export function addressesOf(accounts: MailboxRow[]): string[] {
  const ordered = [...accounts].sort((a, b) => a.created_at.localeCompare(b.created_at) || address(a.from_email).localeCompare(address(b.from_email)));
  return [...new Set(ordered.map((a) => address(a.from_email)))];
}

// May another address be connected, and what should the screen say about it?
export function canAddMailbox(accounts: MailboxRow[], approval: MailboxApproval | null): { canAdd: boolean; note: string } {
  const count = addressesOf(accounts).length;
  if (!approval || count === 0) return { canAdd: true, note: '' };
  if (approval.status !== 'active') return { canAdd: false, note: 'Sending from more than one mailbox is switched on by Shoonya for each business.' };
  const max = approval.max_mailboxes ?? 1;
  if (count >= max) return { canAdd: false, note: `All ${max} mailboxes your approval covers are connected. Remove one to add another.` };
  return { canAdd: true, note: `Your approval covers ${max} mailboxes (${count} connected), ${approval.org_daily_cap} emails a day between them.` };
}

// Is this mailbox held back by the rule? Mailboxes connected before the rule never are.
export function mailboxBlocked(account: MailboxRow, accounts: MailboxRow[], approval: MailboxApproval | null): boolean {
  if (!approval || account.pool_exempt) return false;
  const position = addressesOf(accounts).indexOf(address(account.from_email)) + 1;
  return position > (approval.status === 'active' ? approval.max_mailboxes ?? 1 : 1);
}
