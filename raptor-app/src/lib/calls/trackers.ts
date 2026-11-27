// Watch words: a team's own phrases (competitors, discounts, product names, objections) counted in every call, by who said them. Counted
// from the saved lines whenever a call is shown, so a new watch word works on old calls too.
import { countOf, tokens } from './words.ts';

export type Who = 'any' | 'rep' | 'other';
export interface Tracker { id: string; name: string; phrases: string[]; who: Who; is_active: boolean }
export interface Line { who: string; at: number | null; text: string }
export interface Hit { tracker: Tracker; count: number; lines: number[] }

export const WHO_LABELS: Record<Who, string> = { any: 'Anyone', rep: 'Our side', other: 'The other side' };
export const MAX_TRACKERS = 100;
export const MAX_PHRASES = 50;
const REP = 'You';

/** The lines of a call: its timed record, or (for calls saved by older versions) the "Name: words" lines of its transcript. */
export function linesOf(call: { segments?: Array<{ who?: string; at?: number | null; text?: string }> | null; transcript?: string | null }): Line[] {
  if (call.segments && call.segments.length) {
    return call.segments.map((s) => ({ who: String(s.who || ''), at: s.at ?? null, text: String(s.text || '') }));
  }
  return String(call.transcript || '').split('\n').filter((l) => l.trim()).map((l) => {
    const m = /^([^:]{1,30}):\s(.*)$/.exec(l);
    return m ? { who: m[1], at: null, text: m[2] } : { who: '', at: null, text: l };
  });
}

const heardBy = (line: Line, who: Who, knowRep: boolean) => {
  if (who === 'any') return true;
  if (!knowRep) return false; // nobody can be told apart: a one-sided watch word counts nothing rather than guessing
  return who === 'rep' ? line.who === REP : line.who !== REP;
};

export function hitsFor(lines: Line[], tracker: Tracker): Hit {
  const knowRep = lines.some((l) => l.who === REP);
  let count = 0;
  const found: number[] = [];
  lines.forEach((line, i) => {
    if (!heardBy(line, tracker.who, knowRep)) return;
    const n = countOf(line.text, tracker.phrases);
    if (n) {
      count += n;
      found.push(i);
    }
  });
  return { tracker, count, lines: found };
}

/** The active watch words that were heard, most often first. */
export const allHits = (lines: Line[], trackers: Tracker[]): Hit[] =>
  trackers.filter((t) => t.is_active).map((t) => hitsFor(lines, t)).filter((h) => h.count > 0).sort((a, b) => b.count - a.count);

/** Phrases as typed, one per line or separated by commas: trimmed, empty ones and repeats left out. */
export function splitPhrases(text: string): string[] {
  const seen = new Set<string>();
  return String(text || '').split(/[\n,;|।]+/).map((p) => p.trim().replace(/\s+/g, ' ')).filter((p) => {
    const key = tokens(p).join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkTracker(draft: { name: string; phrases: string }, existing: Tracker[] = [], editingId = ''): { error: string } | { name: string; phrases: string[] } {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  const phrases = splitPhrases(draft.phrases);
  if (!name) return { error: 'Give the watch word a name.' };
  if (name.length > 60) return { error: 'Use a shorter name (60 characters at most).' };
  if (existing.some((t) => t.id !== editingId && t.name.toLowerCase() === name.toLowerCase())) return { error: 'There is already a watch word with this name.' };
  if (!phrases.length) return { error: 'Add at least one word or phrase to listen for.' };
  if (phrases.length > MAX_PHRASES) return { error: `Use ${MAX_PHRASES} phrases at most.` };
  if (phrases.some((p) => p.length > 80)) return { error: 'A phrase can be 80 characters at most.' };
  if (!editingId && existing.length >= MAX_TRACKERS) return { error: `A team can have ${MAX_TRACKERS} watch words.` };
  return { name, phrases };
}

/** Ready-made watch words a team can add with one press. */
export const STARTERS: Array<{ name: string; phrases: string[]; who: Who }> = [
  { name: 'Price and discount', who: 'any', phrases: ['price', 'pricing', 'cost', 'discount', 'budget', 'expensive', 'कीमत', 'दाम', 'महंगा', 'डिस्काउंट', 'बजट', 'mehenga', 'keemat'] },
  { name: 'Someone else decides', who: 'other', phrases: ['my boss', 'my manager', 'my team', 'board', 'management', 'decision maker', 'check with', 'बॉस', 'सर से', 'मैनेजमेंट', 'boss se'] },
  { name: 'Asked for it in writing', who: 'other', phrases: ['send me', 'email me', 'quotation', 'proposal', 'brochure', 'भेज दीजिए', 'ईमेल', 'कोटेशन', 'bhej dijiye'] },
  { name: 'Next meeting', who: 'any', phrases: ['demo', 'meeting', 'tomorrow', 'next week', 'calendar', 'invite', 'डेमो', 'मीटिंग', 'अगले हफ्ते', 'agle hafte'] },
];
