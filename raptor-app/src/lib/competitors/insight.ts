// What a team can learn about a competitor from its own records: calls that mention them, deals won and lost against them, and how their
// prices moved. Counted from what was saved; nothing is estimated.
import { findIn, tokens } from '../calls/words.ts';
import { linesOf } from '../calls/trackers.ts';

export interface MentionCall {
  id: string; company_name: string; started_at: string; deal_id?: string | null; transcript?: string | null;
  segments?: Array<{ who?: string; at?: number | null; text?: string }> | null;
  metrics?: { objections?: Array<{ line: number; kind: string }> } | null;
}
export interface Mention { callId: string; company: string; at: string; line: number; time: number | null; who: string; quote: string; concern: string }
export type Outcome = 'won' | 'lost' | 'open';

const SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|technologies|technology|labs|software|systems|group|gmbh|pvt|plc)\b\.?,?/gi;

/** The name, the name without "Ltd" and the like, and the other names the team added. Very short derived names are left out: they match ordinary speech. */
export function namesOf(c: { name: string; aliases?: string[] | null }): string[] {
  const short = c.name.replace(SUFFIXES, '').replace(/\s+/g, ' ').replace(/^[ ,.-]+|[ ,.-]+$/g, '');
  const derived = short && short !== c.name && short.length >= 4 ? [short] : [];
  return [...new Set([c.name, ...derived, ...(c.aliases || [])].map((n) => n.trim()).filter(Boolean))];
}

const CONCERN_REACH = 2; // a concern within this many lines of the mention is shown with it

export function mentionsIn(calls: MentionCall[], names: string[]): Mention[] {
  const out: Mention[] = [];
  for (const call of calls) {
    linesOf(call).forEach((line, i) => {
      const heard = tokens(line.text);
      if (!names.some((n) => findIn(heard, n) >= 0)) return;
      const concern = (call.metrics?.objections || []).find((o) => Math.abs(o.line - i) <= CONCERN_REACH);
      out.push({ callId: call.id, company: call.company_name, at: call.started_at, line: i, time: line.at, who: line.who, quote: line.text, concern: concern?.kind || '' });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.line - b.line);
}

export interface MentionSummary { mentions: number; calls: number; byThem: number; byUs: number; deals: { won: number; lost: number; open: number }; concerns: Array<[string, number]> }

export function mentionSummary(mentions: Mention[], calls: MentionCall[], outcomeOf: (dealId: string) => Outcome | undefined): MentionSummary {
  const ids = new Set(mentions.map((m) => m.callId));
  const deals = new Set(calls.filter((c) => ids.has(c.id) && c.deal_id).map((c) => c.deal_id as string));
  const tally = { won: 0, lost: 0, open: 0 };
  for (const id of deals) {
    const outcome = outcomeOf(id);
    if (outcome) tally[outcome] += 1;
  }
  const concerns = new Map<string, Set<string>>();
  for (const m of mentions) if (m.concern) concerns.set(m.concern, (concerns.get(m.concern) || new Set()).add(m.callId));
  return {
    mentions: mentions.length, calls: ids.size, byUs: mentions.filter((m) => m.who === 'You').length, byThem: mentions.filter((m) => m.who !== 'You').length,
    deals: tally, concerns: [...concerns.entries()].map(([k, v]) => [k, v.size] as [string, number]).sort((a, b) => b[1] - a[1]),
  };
}

export interface Deal { id: string; title: string; stage: string; value: number | null; competitors?: string[] | null; outcome_reason?: string | null; closed_at?: string | null }
export interface WinLoss { competitor: string; won: number; lost: number; open: number; winRate: number | null; valueWon: number; valueLost: number; lossReasons: Array<[string, number]>; winReasons: Array<[string, number]> }

const top = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

/** Deals that name a competitor, by competitor. Names are matched without regard to capitals; the list's spelling is used when known. */
export function winLoss(deals: Deal[], typeOf: (stage: string) => Outcome, listed: string[] = []): WinLoss[] {
  const spelling = new Map(listed.map((n) => [n.toLowerCase(), n]));
  const rows = new Map<string, WinLoss & { why: { won: Map<string, number>; lost: Map<string, number> } }>();
  for (const d of deals) {
    for (const raw of new Set((d.competitors || []).map((c) => c.trim()).filter(Boolean).map((c) => c.toLowerCase()))) {
      const name = spelling.get(raw) || (d.competitors || []).find((c) => c.trim().toLowerCase() === raw)!.trim();
      const row = rows.get(raw) || { competitor: name, won: 0, lost: 0, open: 0, winRate: null, valueWon: 0, valueLost: 0, lossReasons: [], winReasons: [], why: { won: new Map(), lost: new Map() } };
      const outcome = typeOf(d.stage);
      row[outcome] += 1;
      if (outcome !== 'open') {
        row[outcome === 'won' ? 'valueWon' : 'valueLost'] += Number(d.value) || 0;
        const reason = (d.outcome_reason || '').trim();
        if (reason) row.why[outcome].set(reason, (row.why[outcome].get(reason) || 0) + 1);
      }
      rows.set(raw, row);
    }
  }
  return [...rows.values()].map(({ why, ...row }) => ({
    ...row, winRate: row.won + row.lost ? Math.round((100 * row.won) / (row.won + row.lost)) : null, lossReasons: top(why.lost), winReasons: top(why.won),
  })).sort((a, b) => b.won + b.lost + b.open - (a.won + a.lost + a.open) || a.competitor.localeCompare(b.competitor));
}

export const REASONS = ['Price', 'Missing feature', 'Already had a supplier', 'Timing', 'Champion left', 'No decision', 'Better relationship', 'Faster to start', 'Support', 'Trust'];

export interface Update { id: string; competitor_id: string; kind: string; title: string; summary: string; url: string | null; significance: 'high' | 'medium' | 'low'; status: 'new' | 'important' | 'hidden'; details?: any; happened_at: string }
export const KIND_NAMES: Record<string, string> = { price: 'Price', page: 'Page change', news: 'News', reviews: 'Reviews', hiring: 'Hiring', content: 'New post', seo: 'Search', tech: 'Technology', note: 'Heard by the team' };

/** Lowest and highest listed price over time, oldest first (from the feed's price entries). */
export function priceHistory(updates: Update[]): Array<{ date: string; min: number; max: number }> {
  return updates.filter((u) => u.kind === 'price' && Number.isFinite(u.details?.min) && Number.isFinite(u.details?.max))
    .map((u) => ({ date: u.happened_at.slice(0, 10), min: Number(u.details.min), max: Number(u.details.max) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The feed as shown: hidden entries out (unless asked for), important ones can be filtered. */
export function feed(updates: Update[], show: { competitor?: string; kind?: string; only?: 'important' | 'hidden' | '' } = {}): Update[] {
  return updates.filter((u) => (!show.competitor || u.competitor_id === show.competitor) && (!show.kind || u.kind === show.kind)
    && (show.only === 'hidden' ? u.status === 'hidden' : show.only === 'important' ? u.status === 'important' : u.status !== 'hidden'))
    .sort((a, b) => b.happened_at.localeCompare(a.happened_at));
}
