// How the measures of a call (worked out by the PC app, raptor/calls/measures.py) are put into words. Used by the web and the PC screens.

export interface Measures {
  version: number;
  reliability: 'measured' | 'estimate' | 'unknown';
  lines: number;
  duration: number;
  talk: { rep_seconds: number; other_seconds: number; rep_words: number; other_words: number; rep_share: number | null } | null;
  longest_monologue: { seconds: number; line: number; at: number | null } | null;
  questions: { count: number; lines: number[] } | null;
  switches_per_minute: number | null;
  reply_gap: { seconds: number; count: number } | null;
  weak: { count: number; lines: number[] } | null;
  fillers: number | null;
  objections: Array<{ line: number; at: number | null; kind: string; phrase: string; acknowledged: boolean | null }>;
  buying_signals: Array<{ line: number; at: number | null; phrase: string }>;
  first_price: { line: number; at: number | null; who: string } | null;
  next_step: { mentioned: boolean; line: number | null; at: number | null } | null;
}

export type Tone = 'good' | 'watch' | 'plain';
export interface Card { key: string; label: string; value: string; hint: string; tone: Tone; lines: number[] }

export const OBJECTION_NAMES: Record<string, string> = {
  price: 'Price', have_solution: 'Already has a solution', timing: 'Timing', busy: 'Busy', not_interested: 'Not interested', no_need: 'No need',
  decision: 'Someone else decides', think: 'Wants to think', send_info: 'Asked for information', trust: 'Does not trust the caller yet',
  unsure: 'Unsure', doesnt_work: 'Says it does not work',
};

export const RELIABILITY_NOTES: Record<Measures['reliability'], string> = {
  measured: '',
  estimate: 'One microphone heard everyone, so a line may carry the wrong name: read these as estimates.',
  unknown: 'It was not known which voice was ours, so the measures about our side are left out.',
};

export const mmss = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const percent = (share: number) => `${Math.round(share * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The figures worth showing for a call. A figure that was not measured is left out rather than shown as zero. */
export function measureCards(m: Measures | null | undefined): Card[] {
  if (!m) return [];
  const cards: Card[] = [];
  const add = (key: string, label: string, value: string, hint = '', tone: Tone = 'plain', lines: number[] = []) => cards.push({ key, label, value, hint, tone, lines });
  if (m.talk && m.talk.rep_share !== null) {
    const share = m.talk.rep_share;
    add('talk', 'Our share of the talking', percent(share), share > 0.65 ? 'More listening usually helps.' : '', share > 0.65 ? 'watch' : 'good');
  }
  if (m.longest_monologue) {
    const long = m.longest_monologue.seconds;
    add('monologue', 'Longest stretch without a reply', mmss(long), long > 90 ? 'Long stretches lose people.' : '', long > 90 ? 'watch' : 'plain', [m.longest_monologue.line]);
  }
  if (m.questions) add('questions', 'Questions we asked', String(m.questions.count), m.questions.count < 3 ? 'Few questions were asked.' : '', m.questions.count < 3 ? 'watch' : 'good', m.questions.lines);
  if (m.objections.length) {
    const judged = m.objections.filter((o) => o.acknowledged !== null);
    const answered = judged.filter((o) => o.acknowledged).length;
    add('objections', 'Concerns they raised', String(m.objections.length), judged.length ? `${answered} of ${judged.length} acknowledged first` : '',
      judged.length && answered < judged.length ? 'watch' : 'plain', m.objections.map((o) => o.line));
  }
  if (m.buying_signals.length) add('signals', 'Signs of interest', String(m.buying_signals.length), '', 'good', m.buying_signals.map((s) => s.line));
  if (m.first_price) {
    const who = m.first_price.who === 'You' ? 'we raised it' : m.reliability === 'unknown' ? '' : 'they raised it';
    add('price', 'Price first mentioned', m.first_price.at === null ? 'Yes' : mmss(m.first_price.at), who, 'plain', [m.first_price.line]);
  }
  if (m.next_step) {
    add('next', 'Next step mentioned', m.next_step.mentioned ? 'Yes' : 'No', m.next_step.mentioned ? '' : 'Nothing about what happens next was heard near the end.',
      m.next_step.mentioned ? 'good' : 'watch', m.next_step.line === null ? [] : [m.next_step.line]);
  }
  if (m.reply_gap) add('gap', 'Pause before we reply', `${m.reply_gap.seconds} s`, m.reply_gap.seconds < 0.4 ? 'Replies come very fast.' : '', m.reply_gap.seconds < 0.4 ? 'watch' : 'plain');
  if (m.switches_per_minute !== null) add('switches', 'Turns per minute', String(m.switches_per_minute));
  if (m.weak && m.weak.count) add('weak', 'Apologetic phrases', String(m.weak.count), '', 'watch', m.weak.lines);
  if (m.fillers) add('fillers', 'Filler words', plural(m.fillers, 'time'));
  return cards;
}
