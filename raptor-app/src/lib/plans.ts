// lib/plans.ts
// What each Raptor plan allows, for the screens. The same table lives in the database (db/migrations/2026-11-27_plans.sql in the Raptor
// repository), the server (raptor/utility/plans.py) and the desktop engine; a test in the Raptor repository checks that they agree.
// The database and the server are the real locks: this only decides what to show. The plan name read through org_plan() already has
// expiry applied.

export type Feature = 'crm' | 'automation' | 'desktop_send' | 'desktop_engine' | 'ai_sdr' | 'brain';
export type PlanKey = 'free' | 'reach' | 'core' | 'sdr' | 'brain' | 'full';

const ALL: Feature[] = ['crm', 'automation', 'desktop_send', 'desktop_engine', 'ai_sdr', 'brain'];
export const PLAN_FEATURES: Record<PlanKey, Feature[]> = {
  free: ['crm'], reach: ALL.slice(0, 3), core: ALL.slice(0, 4), sdr: ALL.slice(0, 5), brain: ALL, full: ALL,
};

const KEYS: Record<string, PlanKey> = { reach: 'reach', core: 'core', sdr: 'sdr', brain: 'brain', pro: 'full', prime: 'full', enterprise: 'full' };
export const planKey = (plan: string | null | undefined): PlanKey => KEYS[String(plan ?? '').trim().toLowerCase()] ?? 'free';
export const hasFeature = (plan: string | null | undefined, feature: Feature): boolean => PLAN_FEATURES[planKey(plan)].includes(feature);
export const isPaid = (plan: string | null | undefined): boolean => planKey(plan) !== 'free';

/** What my_entitlements() returns (only the parts the screens use). */
export interface Entitlements {
  plan: string;
  key: PlanKey;
  expired: boolean;
  expires_at: string | null;
  limits: Record<'users' | 'contacts' | 'researched' | 'contacted' | 'credits', number | null>;
  usage?: Record<'users' | 'contacts' | 'researched' | 'contacted', number>;
}

export interface UsageLine { label: string; used: number; limit: number; full: boolean }

/** The limits that apply to this organization, with how much of each is used. A limit of "none" or zero is not listed. */
export function usageLines(e: Entitlements): UsageLine[] {
  const names: [keyof NonNullable<Entitlements['usage']>, string][] = [
    ['users', 'Users'], ['contacts', 'Contacts'], ['researched', 'Prospects researched this month'], ['contacted', 'Prospects contacted this month'],
  ];
  return names.flatMap(([key, label]) => {
    const limit = e.limits?.[key];
    if (limit === null || limit === undefined || limit <= 0) return [];
    const used = e.usage?.[key] ?? 0;
    return [{ label, used, limit, full: used >= limit }];
  });
}
