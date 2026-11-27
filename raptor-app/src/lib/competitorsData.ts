// Reading and writing competitors for the web screens. The PC app watches their sites and writes the cards; here the team reads, corrects
// and adds to them. Parts that need a database update the owner has not run fail softly.
import { supabase } from './supabaseClient';
import { selectAll } from './selectAll';
import { isNotInstalled } from './dbMissing';
import { optional, safeTerm } from './callsData';
import { loadPipelineStages } from './pipelineStages';
import type { Competitor } from './competitors/card';
import type { Deal, MentionCall, Outcome, Update } from './competitors/insight';

export async function loadCompetitors(): Promise<{ rows: Competitor[]; editable: boolean }> {
  const { data, error } = await selectAll<Competitor>(() => supabase.from('competitors').select('*'));
  if (error) {
    if (isNotInstalled(error)) return { rows: [], editable: false };
    throw error;
  }
  const rows = (data || []).sort((a, b) => a.name.localeCompare(b.name));
  // the editing columns come with 2026-11-30_g_competitor_cards.sql
  const probe = await supabase.from('competitors').select('confirmed').limit(1);
  return { rows, editable: !probe.error };
}

export const loadUpdates = (competitorId = '', days = 180) => optional<Update>(() => {
  let q: any = supabase.from('competitor_updates').select('*').gte('happened_at', new Date(Date.now() - days * 86400000).toISOString());
  if (competitorId) q = q.eq('competitor_id', competitorId);
  return q.order('happened_at', { ascending: false }).limit(500);
});

/** Deals that name at least one competitor, and the kind of every stage. */
export async function loadDeals(): Promise<{ deals: Deal[]; typeOf: (stage: string) => Outcome; installed: boolean }> {
  const stages = await loadPipelineStages().catch(() => []);
  const kinds = Object.fromEntries(stages.map((s) => [s.key, s.type]));
  const typeOf = (stage: string) => (kinds[stage] || (stage === 'won' || stage === 'lost' ? stage : 'open')) as Outcome;
  const { data, error } = await selectAll<Deal>(() => supabase.from('deals').select('id, title, stage, value, competitors, outcome_reason, closed_at').neq('competitors', '{}'));
  if (error) {
    if (isNotInstalled(error)) return { deals: [], typeOf, installed: false };
    throw error;
  }
  return { deals: data || [], typeOf, installed: true };
}

/** Calls whose words contain any of these names (narrowed by the database; the exact word match is done on the screen). */
export async function loadMentionCalls(names: string[], days = 180): Promise<{ calls: MentionCall[]; stageOf: Record<string, string> }> {
  const wanted = names.map(safeTerm).filter((n) => n.length >= 2);
  if (!wanted.length) return { calls: [], stageOf: {} };
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const build = (columns: string) => () => supabase.from('calls').select(columns).gte('started_at', since)
    .or(wanted.map((n) => `transcript.ilike.%${n}%`).join(','));
  let result = await selectAll<MentionCall>(build('id, company_name, started_at, deal_id, transcript, segments, metrics'));
  if (result.error && isNotInstalled(result.error)) result = await selectAll<MentionCall>(build('id, company_name, started_at, transcript'));
  if (result.error) throw result.error;
  const calls = result.data || [];
  const dealIds = [...new Set(calls.map((c) => c.deal_id).filter(Boolean))] as string[];
  const stageOf: Record<string, string> = {};
  for (let i = 0; i < dealIds.length; i += 200) {
    const { data } = await supabase.from('deals').select('id, stage').in('id', dealIds.slice(i, i + 200));
    for (const d of data || []) stageOf[d.id] = d.stage;
  }
  return { calls, stageOf };
}
