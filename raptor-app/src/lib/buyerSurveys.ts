// The short survey a buyer answers after a deal is won or lost (db/migrations/2026-12-01_b_buyer_surveys.sql; public page
// ventures/raptor/survey.html). Raptor sends nothing: the person copies the link or opens an email draft.
export const SURVEY_PAGE = 'https://shoonyaorigins.com/ventures/raptor/survey.html';
export const SURVEY_SQL = '2026-12-01_b_buyer_surveys.sql';

export interface Survey {
  id: string; deal_id: string; token: string; created_at: string; expires_at: string; opened_at: string | null; answered_at: string | null;
  reason: string | null; chose: string | null; better: string | null; rating: number | null; deals?: { title: string; stage: string } | null;
}

export const SURVEY_REASONS: Record<string, string> = {
  price: 'Price', missing_feature: 'A missing feature', chose_competitor: 'Chose another provider', timing: 'Timing', no_need: 'No longer needed',
  trust: 'Trust or support', good_fit: 'It fitted what they needed', other: 'Another reason',
};

export const surveyLink = (token: string) => `${SURVEY_PAGE}?q=${token}`;

/** An email draft the person reads and sends themselves. */
export function surveyDraft(token: string, email: string, name: string): string {
  const subject = 'One minute of your view?';
  const body = `Hello${name ? ` ${name.split(/\s+/)[0]}` : ''},\n\nThank you for considering us. Would you tell us what decided it? It takes about a minute:\n${surveyLink(token)}\n\nThank you.`;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function surveyState(s: Survey, now: Date = new Date()): 'answered' | 'expired' | 'opened' | 'waiting' {
  if (s.answered_at) return 'answered';
  if (Date.parse(s.expires_at) < now.getTime()) return 'expired';
  return s.opened_at ? 'opened' : 'waiting';
}

export interface SurveySummary {
  sent: number; answered: number; reasons: Array<{ reason: string; label: string; count: number }>;
  others: Array<{ name: string; count: number }>; rating: number | null; ratings: number; comments: Survey[];
}

/** Counted from the answers only; the number of answers behind each figure is always given. */
export function summarise(surveys: Survey[]): SurveySummary {
  const answered = surveys.filter((s) => s.answered_at);
  const count = <T,>(list: T[], key: (item: T) => string) => {
    const map = new Map<string, { key: string; first: T; count: number }>();
    for (const item of list) {
      const k = key(item);
      const row = map.get(k);
      if (row) row.count += 1; else map.set(k, { key: k, first: item, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  const rated = answered.filter((s) => s.rating);
  return {
    sent: surveys.length,
    answered: answered.length,
    reasons: count(answered.filter((s) => s.reason), (s) => s.reason as string).map((r) => ({ reason: r.key, label: SURVEY_REASONS[r.key] || r.key, count: r.count })),
    others: count(answered.filter((s) => s.chose?.trim()), (s) => (s.chose as string).trim().toLowerCase()).map((r) => ({ name: (r.first.chose as string).trim(), count: r.count })),
    rating: rated.length ? Math.round((10 * rated.reduce((sum, s) => sum + (s.rating as number), 0)) / rated.length) / 10 : null,
    ratings: rated.length,
    comments: answered.filter((s) => s.better?.trim()).sort((a, b) => String(b.answered_at).localeCompare(String(a.answered_at))),
  };
}
