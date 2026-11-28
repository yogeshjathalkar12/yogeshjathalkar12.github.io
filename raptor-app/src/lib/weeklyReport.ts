// One week's results, for the weekly review with a client. Everything is counted from what is saved online. Figures from different places
// (outreach by the PC app, web email campaigns, calls, the pipeline) are shown separately and never added together, so nothing is counted twice.
// A source that is not set up is left out and named, never shown as zero.

export interface OutreachEvent { company_name: string; channel: string; outcome: string; created_at: string }
export interface CampaignSend { sent_at: string | null; opened_at: string | null; clicked_at: string | null }
export interface ReportDeal { title: string; stage: string; value?: number | null; created_at: string; closed_at?: string | null; meeting_at?: string | null; deleted_at?: string | null }
export interface ReportCall { company_name: string; started_at: string; duration_seconds?: number | null; metrics?: { next_step?: { mentioned: boolean } | null } | null }
export interface ReportData {
  events: OutreachEvent[] | null; campaigns: CampaignSend[] | null; prospects: Array<{ entity_name: string; created_at: string }> | null;
  deals: ReportDeal[] | null; calls: ReportCall[] | null; tasks: Array<{ done_at: string | null }> | null;
  wonStages: string[]; lostStages: string[];
}

export interface Figure { label: string; now: number; before: number; money?: boolean }
export interface Section { title: string; figures: Figure[]; names?: Array<{ label: string; list: string[] }>; note?: string }
export interface Report { from: Date; to: Date; sections: Section[]; missing: string[] }

const DAY = 86400000;

/** Monday 00:00 of the week `back` weeks before the one holding `now` (local time). */
export function weekStart(now: Date, back = 0): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * back);
  return d;
}

const unique = (names: string[]) => {
  const seen = new Map<string, string>();
  for (const n of names) {
    const key = n.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, n.trim());
  }
  return [...seen.values()];
};

export function buildReport(data: ReportData, from: Date): Report {
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  const prior = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7);
  const within = (value: string | null | undefined, a: Date, b: Date) => {
    const t = value ? Date.parse(value) : NaN;
    return t >= a.getTime() && t < b.getTime();
  };
  const pair = <T,>(rows: T[], when: (row: T) => string | null | undefined): [T[], T[]] => [rows.filter((r) => within(when(r), from, to)), rows.filter((r) => within(when(r), prior, from))];
  const figure = <T,>(label: string, two: [T[], T[]], measure: (rows: T[]) => number = (r) => r.length, money = false): Figure => ({ label, now: measure(two[0]), before: measure(two[1]), ...(money ? { money } : {}) });
  const sections: Section[] = [];
  const missing: string[] = [];

  if (data.events) {
    const events = pair(data.events, (e) => e.created_at);
    const of = (outcome: string) => [events[0].filter((e) => e.outcome === outcome), events[1].filter((e) => e.outcome === outcome)] as [OutreachEvent[], OutreachEvent[]];
    const companies = (rows: OutreachEvent[]) => unique(rows.map((r) => r.company_name)).length;
    const channels = unique(events[0].filter((e) => e.outcome === 'sent').map((e) => e.channel || 'email'));
    sections.push({
      title: 'Outreach',
      figures: [
        figure('Messages sent', of('sent')), figure('Companies contacted', of('sent'), companies), figure('Companies that replied', of('replied'), companies),
        figure('Meetings booked', of('meeting'), companies),
      ],
      names: [{ label: 'Replied', list: unique(of('replied')[0].map((e) => e.company_name)) }, { label: 'Meetings booked with', list: unique(of('meeting')[0].map((e) => e.company_name)) }],
      note: channels.length > 1 ? `Sent by ${channels.join(', ')}.` : undefined,
    });
  } else missing.push('outreach results');

  if (data.campaigns) {
    const sent = pair(data.campaigns, (c) => c.sent_at);
    if (sent[0].length || sent[1].length) {
      sections.push({
        title: 'Email campaigns',
        figures: [figure('Emails sent', sent), figure('Opened', sent, (r) => r.filter((x) => x.opened_at).length), figure('Clicked', sent, (r) => r.filter((x) => x.clicked_at).length)],
        note: 'Opens are indicative: some mail programs open messages by themselves, others hide it.',
      });
    }
  } else missing.push('email campaigns');

  if (data.prospects) sections.push({ title: 'Research', figures: [figure('New prospects researched', pair(data.prospects, (p) => p.created_at))] });
  else missing.push('prospects');

  if (data.calls) {
    const calls = pair(data.calls, (c) => c.started_at);
    sections.push({
      title: 'Calls',
      figures: [
        figure('Calls', calls), figure('Minutes', calls, (r) => Math.round(r.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60)),
        figure('Calls ending with a next step', calls, (r) => r.filter((c) => c.metrics?.next_step?.mentioned).length),
      ],
    });
  } else missing.push('calls');

  if (data.deals) {
    const live = data.deals.filter((d) => !d.deleted_at);
    const made = pair(live, (d) => d.created_at);
    const won = pair(live.filter((d) => data.wonStages.includes(d.stage)), (d) => d.closed_at);
    const lost = pair(live.filter((d) => data.lostStages.includes(d.stage)), (d) => d.closed_at);
    const total = (rows: ReportDeal[]) => rows.reduce((s, d) => s + Number(d.value || 0), 0);
    sections.push({
      title: 'Pipeline',
      figures: [
        figure('New deals', made), figure('Value of new deals', made, total, true), figure('Deals won', won), figure('Value won', won, total, true), figure('Deals lost', lost),
      ],
      names: [{ label: 'Won', list: won[0].map((d) => d.title) }, { label: 'New', list: made[0].map((d) => d.title) }],
    });
  } else missing.push('deals');

  if (data.tasks) sections.push({ title: 'Work done', figures: [figure('Tasks completed', pair(data.tasks, (t) => t.done_at))] });
  else missing.push('tasks');

  return { from, to, sections, missing };
}

export const change = (f: Figure): string => {
  if (f.now === f.before) return 'same as the week before';
  const diff = f.now - f.before;
  return `${diff > 0 ? 'up' : 'down'} from ${f.before}`;
};

/** The report as plain text, to paste into an email or a message. */
export function reportText(report: Report, title: string, money: (v: number) => string): string {
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = [title, `${day(report.from)} to ${day(new Date(report.to.getTime() - DAY))}`];
  for (const section of report.sections) {
    lines.push('', section.title);
    for (const f of section.figures) lines.push(`- ${f.label}: ${f.money ? money(f.now) : f.now} (${f.money && f.now !== f.before ? `${f.now > f.before ? 'up' : 'down'} from ${money(f.before)}` : change(f)})`);
    for (const n of section.names || []) if (n.list.length) lines.push(`  ${n.label}: ${n.list.slice(0, 15).join(', ')}${n.list.length > 15 ? ` and ${n.list.length - 15} more` : ''}`);
    if (section.note) lines.push(`  ${section.note}`);
  }
  return lines.join('\n');
}
