// Asking a question across many calls: "who complained about price this month?", "what did Acme say about integration?", "which calls had
// no next step?". No AI model is used: the question is turned into a plain search, and every answer is a line somebody actually said, so
// nothing can be made up. What was understood is always stated, so a misread question is visible.
import { findIn, tokens } from './words.ts';
import { linesOf, type Tracker, type Who } from './trackers.ts';
import { OBJECTION_NAMES, type Measures } from './measuresView.ts';

export interface AskCall {
  id: string; company_name: string; started_at: string; metrics?: Measures | null;
  segments?: Array<{ who?: string; at?: number | null; text?: string }> | null; transcript?: string | null;
}
export interface Rival { name: string; aliases?: string[] | null }

export type Topic =
  | { kind: 'concern'; concerns: string[]; label: string }
  | { kind: 'buying'; label: string }
  | { kind: 'next_step'; missing: boolean; label: string }
  | { kind: 'phrases'; phrases: string[]; label: string; every?: boolean };

export interface Question { topic: Topic | null; who: Who; days: number; companies: string[]; periodSaid: boolean; unanswerable: string }
export interface Match { call: AskCall; line: number | null; at: number | null; who: string; text: string }
export interface Answer { understood: string; matches: Match[]; calls: number; searched: number; notMeasured: number; note: string }

const REP = 'You';
export const DEFAULT_DAYS = 90;
export const MAX_MATCHES = 200;

// words in a question that ask for a concern the call measures already found (the PC app finds these in several languages)
const CONCERNS: Array<[string[], string[]]> = [
  [['price'], ['price', 'pricing', 'expensive', 'costly', 'cost', 'costs', 'budget', 'महंगा', 'महँगा', 'कीमत', 'दाम', 'बजट']],
  [['timing', 'busy'], ['timing', 'busy', 'later', 'next quarter', 'not now', 'no time', 'बाद में', 'व्यस्त']],
  [['have_solution'], ['already use', 'already using', 'already have', 'another vendor', 'existing tool', 'existing solution']],
  [['decision'], ['decision maker', 'someone else decides', 'boss', 'approval', 'sign off']],
  [['not_interested', 'no_need'], ['not interested', 'no need', 'dont need', "don't need", 'said no']],
  [['think'], ['think about it', 'wants to think', 'need to think']],
  [['send_info'], ['send info', 'send information', 'send details', 'brochure', 'send me']],
  [['trust'], ['trust', 'proof', 'references']],
  [['doesnt_work'], ['doesnt work', "doesn't work", 'not working']],
];
const ANY_CONCERN = ['objection', 'objections', 'concern', 'concerns', 'complain', 'complained', 'complaints', 'pushback', 'pushed back', 'worried', 'problem', 'problems'];
const BUYING = ['buying signal', 'buying signals', 'interested in buying', 'ready to buy', 'hot lead', 'hot leads', 'showed interest', 'keen'];

// words that carry no meaning of their own in a question
const FILLER = new Set(('a an and any anyone anybody are as at be been being but by call calls called can company companies could customer customers did do does ' +
  'during ever every for from had has have he her his how i in into is it its last many me mention mentioned mentions month most my of on or our out ' +
  'people person prospect prospects said say says see she should show some somebody someone speak spoke talk talked talking tell than that the their ' +
  'them then there these they thing things this those time times to today told us was we week were what when where which who whom why will with ' +
  'would yesterday year you your about ask asked asking list find give get got all recent recently days day past since please ours let know').split(' '));

const has = (heard: string[], phrases: string[]) => phrases.some((p) => findIn(heard, p) >= 0);

function period(heard: string[]): { days: number; said: boolean; used: string[] } {
  const text = heard.join(' ');
  const n = /\b(?:last|past) (\d{1,3}) (day|days|week|weeks|month|months)\b/.exec(text);
  if (n) {
    const each = n[2].startsWith('day') ? 1 : n[2].startsWith('week') ? 7 : 30;
    return { days: Number(n[1]) * each, said: true, used: [n[1]] };
  }
  const named: Array<[RegExp, number]> = [
    [/\btoday\b/, 1], [/\byesterday\b/, 2], [/\b(this|last|past) week\b/, 7], [/\b(this|last|past) month\b/, 30],
    [/\b(this|last|past) quarter\b/, 90], [/\b(this|last|past) year\b/, 365], [/\b(ever|all time|so far)\b/, 0],
  ];
  for (const [pattern, days] of named) if (pattern.test(text)) return { days, said: true, used: [] };
  return { days: DEFAULT_DAYS, said: false, used: [] };
}

/** "we", "our rep" mean our side; "they", "the customer", "who complained" mean the other side. */
function speaker(heard: string[], concern: boolean): Who {
  if (has(heard, ['did we', 'have we', 'we say', 'we said', 'we told', 'we promised', 'we offered', 'did i', 'did our', 'our rep', 'our team'])) return 'rep';
  if (concern || has(heard, ['they', 'customer', 'customers', 'prospect', 'prospects', 'client', 'clients', 'buyer', 'buyers', 'complained', 'who asked', 'who wants', 'who said'])) return 'other';
  return 'any';
}

/** The companies of these calls that the question names. */
function namedCompanies(heard: string[], calls: AskCall[]): string[] {
  const found = new Set<string>();
  for (const call of calls) {
    const name = String(call.company_name || '').trim();
    if (!name || found.has(name)) continue;
    const words = tokens(name).filter((w) => !['pvt', 'ltd', 'limited', 'inc', 'llp', 'llc', 'private', 'the'].includes(w));
    if (words.length && words.join('').length > 2 && findIn(heard, words.join(' ')) >= 0) found.add(name);
  }
  return [...found];
}

export function parseQuestion(text: string, context: { calls?: AskCall[]; trackers?: Tracker[]; rivals?: Rival[] } = {}): Question {
  const heard = tokens(text);
  const when = period(heard);
  const quoted = [...String(text || '').matchAll(/["“]([^"”]{2,80})["”]/g)].map((m) => m[1].trim()).filter(Boolean);
  const companies = namedCompanies(heard, context.calls || []);
  const base = { days: when.days, periodSaid: when.said, companies, unanswerable: '' };
  const done = (topic: Topic, concern = false, who?: Who): Question => ({ ...base, topic, who: who ?? speaker(heard, concern) });

  if (!heard.length) return { ...base, topic: null, who: 'any', unanswerable: 'Type a question first.' };
  if (quoted.length) return done({ kind: 'phrases', phrases: quoted, label: quoted.map((q) => `"${q}"`).join(' or ') });
  if (/\bnext steps?\b/.test(heard.join(' '))) {
    const missing = has(heard, ['no', 'without', 'missing', 'didnt', "didn't", 'not agree', 'never']);
    return done({ kind: 'next_step', missing, label: missing ? 'calls with no next step said' : 'calls where a next step was said' }, false, 'any');
  }
  // a competitor or one of the team's own watch words, by name
  for (const rival of context.rivals || []) {
    const names = [rival.name, ...(rival.aliases || [])].filter((n) => n && n.trim().length > 1);
    if (names.length && has(heard, names)) return done({ kind: 'phrases', phrases: names, label: `mentions of ${rival.name}` });
  }
  for (const tracker of context.trackers || []) {
    if (tracker.is_active && findIn(heard, tracker.name) >= 0) return done({ kind: 'phrases', phrases: tracker.phrases, label: `the watch word "${tracker.name}"` }, false, tracker.who === 'any' ? undefined : tracker.who);
  }
  if (has(heard, BUYING)) return done({ kind: 'buying', label: 'buying signals' }, false, 'other');
  if (has(heard, ['competitor', 'competitors', 'competition'])) {
    const names = (context.rivals || []).flatMap((r) => [r.name, ...(r.aliases || [])]).filter((n) => n && n.trim().length > 1);
    if (names.length) return done({ kind: 'phrases', phrases: names, label: 'mentions of any competitor on your list' });
    return { ...base, topic: null, who: 'any', unanswerable: 'There are no competitors on your list yet. Add them on the Competitors page, or name one in quotes.' };
  }
  for (const [concerns, words] of CONCERNS) {
    // "what did they say about price" and "who complained about price" both ask for the concern
    if (has(heard, words)) return done({ kind: 'concern', concerns, label: `concerns about ${concerns.map((c) => (OBJECTION_NAMES[c] || c).toLowerCase()).join(' or ')}` }, true);
  }
  if (has(heard, ANY_CONCERN)) return done({ kind: 'concern', concerns: [], label: 'any concern' }, true);

  const companyWords = new Set(companies.flatMap((c) => tokens(c)));
  const words = [...new Set(heard.filter((w) => !FILLER.has(w) && !companyWords.has(w) && !when.used.includes(w) && w.length > 1))];
  if (words.length) return done({ kind: 'phrases', phrases: words, label: words.map((w) => `"${w}"`).join(' and '), every: words.length > 1 });
  if (companies.length) return done({ kind: 'concern', concerns: [], label: 'any concern' }, true);
  return { ...base, topic: null, who: 'any', unanswerable: 'Say what to look for, for example a word in quotes, "price", a competitor name, or "no next step".' };
}

const sideOk = (who: string, wanted: Who, knowRep: boolean) => wanted === 'any' || !knowRep || (wanted === 'rep' ? who === REP : who !== REP);

export function answerQuestion(question: Question, calls: AskCall[], now: Date = new Date()): Answer {
  const topic = question.topic;
  if (!topic) return { understood: '', matches: [], calls: 0, searched: 0, notMeasured: 0, note: question.unanswerable };
  const since = question.days ? now.getTime() - question.days * 86400000 : 0;
  const wanted = calls
    .filter((c) => Date.parse(c.started_at) >= since)
    .filter((c) => !question.companies.length || question.companies.includes(String(c.company_name || '').trim()))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const matches: Match[] = [];
  let notMeasured = 0;
  let oneSided = 0;
  // when several words were asked for, only lines with all of them count; if there are none, lines with any of them are shown and said so
  const search = (all: boolean) => {
    for (const call of wanted) {
      const lines = linesOf(call);
      const knowRep = lines.some((l) => l.who === REP);
      if (topic.kind === 'phrases') {
        lines.forEach((line, i) => {
          if (!sideOk(line.who, question.who, knowRep)) return;
          const heard = tokens(line.text);
          const found = topic.phrases.filter((p) => findIn(heard, p) >= 0).length;
          if (all ? found === topic.phrases.length : found > 0) {
            if (!knowRep && question.who !== 'any') oneSided += 1;
            matches.push({ call, line: i, at: line.at, who: line.who, text: line.text });
          }
        });
        continue;
      }
      const m = call.metrics;
      if (!m) { notMeasured += 1; continue; }
      if (topic.kind === 'next_step') {
        if (!m.next_step) { notMeasured += 1; continue; }
        if (m.next_step.mentioned === !topic.missing) {
          const i = m.next_step.line;
          const line = i !== null && i !== undefined ? lines[i] : undefined;
          matches.push({ call, line: line ? (i as number) : null, at: line?.at ?? null, who: line?.who || '', text: line?.text || '' });
        }
        continue;
      }
      const found = topic.kind === 'buying' ? m.buying_signals || [] : (m.objections || []).filter((o) => !topic.concerns.length || topic.concerns.includes(o.kind));
      for (const item of found) {
        const line = lines[item.line];
        if (line) matches.push({ call, line: item.line, at: line.at, who: line.who, text: line.text });
      }
    }
  };
  let loosened = false;
  const every = topic.kind === 'phrases' && Boolean(topic.every);
  search(every);
  if (every && !matches.length) { loosened = true; search(false); }

  const days = question.days === 0 ? 'all time' : question.days === 1 ? 'the last day' : `the last ${question.days} days`;
  const side = topic.kind === 'next_step' || question.who === 'any' ? '' : question.who === 'rep' ? ', said by our side' : ', said by the other side';
  const at = question.companies.length ? `, in calls with ${question.companies.join(' and ')}` : '';
  const label = loosened && topic.kind === 'phrases' ? topic.label.replace(/ and /g, ' or ') : topic.label;
  const notes: string[] = [];
  if (loosened && matches.length) notes.push('No line held all the words, so lines with any of them are shown.');
  if (notMeasured) notes.push(`${notMeasured} call${notMeasured === 1 ? ' was' : 's were'} not measured and could not be checked.`);
  if (oneSided) notes.push('In some calls the two sides could not be told apart, so a line may be from our side.');
  if (matches.length > MAX_MATCHES) notes.push(`Showing the newest ${MAX_MATCHES} of ${matches.length} lines.`);
  return {
    understood: `Looked for ${label}${side}${at}, ${days}.`,
    matches: matches.slice(0, MAX_MATCHES),
    calls: new Set(matches.map((m) => m.call.id)).size,
    searched: wanted.length,
    notMeasured,
    note: notes.join(' '),
  };
}

export const EXAMPLES = ['Who complained about price this month?', 'Which calls had no next step in the last 2 weeks?', 'Any buying signals this week?', 'Who mentioned "integration"?'];
