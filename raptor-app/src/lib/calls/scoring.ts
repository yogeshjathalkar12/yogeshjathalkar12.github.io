// Scorecards: a team's checklist for a good call. Some items are answered from what was counted about the call, the rest by a person.
import type { Measures } from './measuresView.ts';
import type { Hit } from './trackers.ts';

export type Answer = 'yes' | 'no' | 'na';
export type RuleType = 'talk_share' | 'questions' | 'next_step' | 'acknowledged' | 'no_weak' | 'monologue' | 'watch_word';
export interface Rule { type: RuleType; value?: number; tracker?: string }
export interface Item { id: string; label: string; kind: 'auto' | 'manual'; rule?: Rule }
export interface Scorecard { id: string; name: string; items: Item[]; is_active: boolean }

export const RULES: Record<RuleType, { label: string; needs?: 'value' | 'tracker'; unit?: string; usual?: number }> = {
  talk_share: { label: 'We spoke no more than this share of the time', needs: 'value', unit: '%', usual: 60 },
  questions: { label: 'We asked at least this many questions', needs: 'value', unit: 'questions', usual: 5 },
  next_step: { label: 'A next step was mentioned near the end' },
  acknowledged: { label: 'Every concern was acknowledged before answering' },
  no_weak: { label: 'No apologetic phrases' },
  monologue: { label: 'No stretch without a reply longer than this', needs: 'value', unit: 'seconds', usual: 90 },
  watch_word: { label: 'This watch word was heard', needs: 'tracker' },
};

/** The answer the call's own numbers give. "na" when they cannot say, so it never counts against anyone. */
export function autoAnswer(rule: Rule, metrics: Measures | null | undefined, hits: Hit[] = []): Answer {
  if (rule.type === 'watch_word') return hits.some((h) => h.tracker.id === rule.tracker && h.count > 0) ? 'yes' : 'no';
  if (!metrics) return 'na';
  const yes = (v: boolean): Answer => (v ? 'yes' : 'no');
  switch (rule.type) {
    case 'talk_share': return metrics.talk?.rep_share === null || metrics.talk === null ? 'na' : yes(metrics.talk.rep_share * 100 <= (rule.value ?? 60));
    case 'questions': return metrics.questions ? yes(metrics.questions.count >= (rule.value ?? 5)) : 'na';
    case 'next_step': return metrics.next_step ? yes(metrics.next_step.mentioned) : 'na';
    case 'acknowledged': {
      const judged = (metrics.objections || []).filter((o) => o.acknowledged !== null);
      return judged.length ? yes(judged.every((o) => o.acknowledged)) : 'na';
    }
    case 'no_weak': return metrics.weak ? yes(metrics.weak.count === 0) : 'na';
    case 'monologue': return metrics.longest_monologue ? yes(metrics.longest_monologue.seconds <= (rule.value ?? 90)) : 'na';
    default: return 'na';
  }
}

/** The starting answers when somebody scores a call: the automatic ones filled in, the manual ones left open. */
export const startingAnswers = (card: Scorecard, metrics: Measures | null | undefined, hits: Hit[]): Record<string, Answer> =>
  Object.fromEntries(card.items.map((item) => [item.id, item.kind === 'auto' && item.rule ? autoAnswer(item.rule, metrics, hits) : 'na']));

/** Out of 100, counting only the items answered yes or no. null when nothing was answered. */
export function scoreOf(card: Scorecard, answers: Record<string, Answer>): number | null {
  const counted = card.items.map((i) => answers[i.id]).filter((a) => a === 'yes' || a === 'no');
  return counted.length ? Math.round((100 * counted.filter((a) => a === 'yes').length) / counted.length) : null;
}

export function checkScorecard(draft: { name: string; items: Item[] }, existing: Scorecard[] = [], editingId = ''): { error: string } | { name: string; items: Item[] } {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Give the scorecard a name.' };
  if (name.length > 80) return { error: 'Use a shorter name (80 characters at most).' };
  if (existing.some((c) => c.id !== editingId && c.name.toLowerCase() === name.toLowerCase())) return { error: 'There is already a scorecard with this name.' };
  const items: Item[] = [];
  for (const item of draft.items) {
    const label = item.label.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    if (label.length > 160) return { error: 'An item can be 160 characters at most.' };
    if (item.kind === 'auto') {
      const rule = item.rule && RULES[item.rule.type] ? item.rule : null;
      if (!rule) return { error: `Choose how "${label}" is checked.` };
      if (RULES[rule.type].needs === 'value' && !(Number(rule.value) > 0)) return { error: `Enter a number for "${label}".` };
      if (RULES[rule.type].needs === 'tracker' && !rule.tracker) return { error: `Choose the watch word for "${label}".` };
      items.push({ id: item.id, label, kind: 'auto', rule });
    } else items.push({ id: item.id, label, kind: 'manual' });
  }
  if (!items.length) return { error: 'Add at least one item.' };
  if (items.length > 30) return { error: 'A scorecard can have 30 items.' };
  if (new Set(items.map((i) => i.id)).size !== items.length) return { error: 'Two items have the same id.' };
  return { name, items };
}

export const MAX_CLIP_LINES = 60;

/** The lines of a library entry: from one line to another (either order), at most 60. */
export function clipLines<T extends { who: string; text: string }>(lines: T[], from: number, to: number) {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(lines.length - 1, Math.max(from, to), a + MAX_CLIP_LINES - 1);
  return lines.slice(a, b + 1).map((l: any) => ({ who: l.who, text: l.text, at: l.at ?? null }));
}
