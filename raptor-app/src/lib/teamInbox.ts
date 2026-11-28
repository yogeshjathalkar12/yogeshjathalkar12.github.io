// The team's reply inbox (db/migrations/2026-12-03_a_team_inbox.sql). Replies are put there by the PC app of whoever switched sharing on.
export const INBOX_SQL = '2026-12-03_a_team_inbox.sql';

export interface TeamReply {
  id: string; created_by: string | null; contact_id: string | null; company_name: string; from_email: string; from_name: string; subject: string;
  body: string; intent: string; summary: string; draft: string; received_at: string; status: 'open' | 'done'; assignee_id: string | null;
  handled_at: string | null; handled_by: string | null;
}
export interface ReplyNote { id: string; reply_id: string; body: string; created_by: string | null; created_at: string }
export type InboxView = 'open' | 'mine' | 'unassigned' | 'done';

export const INTENT_NAMES: Record<string, string> = {
  interested: 'Interested', meeting_request: 'Wants a meeting', question: 'Asked a question', objection: 'Has a concern', not_now: 'Not now',
  wrong_person: 'Wrong person', not_interested: 'Not interested', unsubscribe: 'Asked to stop', other: 'Other',
};
// the ones most worth answering first
const RANK: Record<string, number> = { meeting_request: 0, interested: 1, question: 2, objection: 3, not_now: 5, wrong_person: 6, other: 7, not_interested: 8, unsubscribe: 9 };

export function inboxList(replies: TeamReply[], view: InboxView, me: string | null | undefined): TeamReply[] {
  const wanted = replies.filter((r) => (view === 'done' ? r.status === 'done'
    : r.status === 'open' && (view === 'mine' ? r.assignee_id === me : view === 'unassigned' ? !r.assignee_id : true)));
  return wanted.sort((a, b) => (view === 'done' ? String(b.handled_at || b.received_at).localeCompare(String(a.handled_at || a.received_at))
    : (RANK[a.intent] ?? 4) - (RANK[b.intent] ?? 4) || b.received_at.localeCompare(a.received_at)));
}

export const replySubject = (subject: string) => (/^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject || 'your email'}`);

/** An email draft the person reads and sends from their own mail program. A very long suggestion is left out: links have a length limit. */
export function mailDraft(reply: Pick<TeamReply, 'from_email' | 'subject' | 'draft'>): string {
  const to = encodeURIComponent(reply.from_email.trim()).replace(/%40/g, '@');
  const body = reply.draft && reply.draft.length <= 1500 ? `&body=${encodeURIComponent(reply.draft)}` : '';
  return `mailto:${to}?subject=${encodeURIComponent(replySubject(reply.subject))}${body}`;
}
