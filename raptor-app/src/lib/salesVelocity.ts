// lib/salesVelocity.ts
// Sales velocity = open deals x average won value x win rate / average days a deal takes to win. The days come from the won deals
// themselves (created to closed); when no won deal has both dates there is nothing to divide by, and the screen shows a dash.

const DAY_MS = 86_400_000;

export interface DatedDeal { created_at?: string | null; closed_at?: string | null }

/** Average days from creating a deal to winning it, or null when it cannot be known. Never under one day. */
export function averageDaysToClose(wonDeals: DatedDeal[]): number | null {
  const spans = wonDeals.flatMap((d) => {
    const start = Date.parse(d?.created_at || '');
    const end = Date.parse(d?.closed_at || '');
    // a close date before the creation date is a history that was typed or imported afterwards: it says nothing about duration
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? [(end - start) / DAY_MS] : [];
  });
  if (!spans.length) return null;
  return Math.max(1, spans.reduce((sum, days) => sum + days, 0) / spans.length);
}

/** Money per day, or null when the duration is unknown. `winRate` is a percentage. */
export function salesVelocity(openDeals: number, avgDealSize: number, winRate: number, avgDays: number | null): number | null {
  return avgDays === null ? null : Math.round((openDeals * avgDealSize * (winRate / 100)) / avgDays);
}
