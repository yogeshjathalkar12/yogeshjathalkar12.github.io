// lib/forecast.ts
// The forecast: each open deal counts its value times its chance of closing, in the month it is expected to close.
// The chance is the deal's own if someone set it; otherwise the stage's; otherwise worked out from the stage's place among the open
// stages (three open stages: 25%, 50%, 75%). Won is 100%, lost is 0%.

export interface ForecastStage { key: string; type: 'open' | 'won' | 'lost'; sort_order: number; probability?: number | null; pipeline_id?: string | null }
export interface ForecastDeal { id: string; title?: string; value?: number | string | null; stage: string; probability?: number | null; expected_close?: string | null; closed_at?: string | null }

export function stageProbability(stage: ForecastStage | undefined, stages: ForecastStage[]): number {
  if (!stage) return 0;
  if (stage.type === 'won') return 100;
  if (stage.type === 'lost') return 0;
  if (stage.probability !== null && stage.probability !== undefined) return stage.probability;
  const open = stages.filter((s) => s.type === 'open' && (s.pipeline_id || '') === (stage.pipeline_id || '')).sort((a, b) => a.sort_order - b.sort_order);
  const place = open.findIndex((s) => s.key === stage.key);
  return place < 0 ? 0 : Math.round(((place + 1) / (open.length + 1)) * 100);
}

export function dealProbability(deal: ForecastDeal, stages: ForecastStage[]): number {
  const stage = stages.find((s) => s.key === deal.stage);
  if (stage && stage.type !== 'open') return stageProbability(stage, stages);     // closed deals are certain either way
  return deal.probability ?? stageProbability(stage, stages);
}

/** "2026-11" for a date, read as written (no time-zone shifting of a plain date). */
export const monthKey = (date: string): string => date.slice(0, 7);

export function monthsFrom(today: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export interface ForecastRow { key: string; deals: number; total: number; weighted: number; won: number }
export interface Forecast { months: ForecastRow[]; overdue: ForecastRow; later: ForecastRow; undated: ForecastRow; overdueDeals: ForecastDeal[]; undatedDeals: ForecastDeal[] }

const row = (key: string): ForecastRow => ({ key, deals: 0, total: 0, weighted: 0, won: 0 });

export function buildForecast(deals: ForecastDeal[], stages: ForecastStage[], today: Date = new Date(), count = 6): Forecast {
  const keys = monthsFrom(today, count);
  const out: Forecast = { months: keys.map(row), overdue: row('overdue'), later: row('later'), undated: row('undated'), overdueDeals: [], undatedDeals: [] };
  for (const deal of deals) {
    const type = stages.find((s) => s.key === deal.stage)?.type;
    const value = Number(deal.value) || 0;
    if (type === 'won') {                      // money already won, in the month it was won
      const month = deal.closed_at ? out.months.find((m) => m.key === monthKey(deal.closed_at as string)) : undefined;
      if (month) month.won += value;
      continue;
    }
    if (type !== 'open') continue;
    let bucket: ForecastRow;
    if (!deal.expected_close) { bucket = out.undated; out.undatedDeals.push(deal); }
    else if (monthKey(deal.expected_close) < keys[0]) { bucket = out.overdue; out.overdueDeals.push(deal); }
    else bucket = out.months.find((m) => m.key === monthKey(deal.expected_close as string)) ?? out.later;
    bucket.deals += 1;
    bucket.total += value;
    bucket.weighted += (value * dealProbability(deal, stages)) / 100;
  }
  return out;
}

/** What to store for the two boxes of a deal: empty stays empty, a probability is kept between 0 and 100. */
export function forecastValues(closeDate: string, probability: string): { expected_close: string | null; probability: number | null } {
  const p = probability.trim() === '' ? null : Math.min(100, Math.max(0, Math.round(Number(probability))));
  return { expected_close: closeDate || null, probability: p === null || Number.isNaN(p) ? null : p };
}
