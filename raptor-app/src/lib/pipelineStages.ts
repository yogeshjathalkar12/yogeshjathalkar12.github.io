import { supabase } from './supabaseClient';

// Shared with the desktop app (raptor-ui/src/pages/crm/pipelineStages.js) -
// same table, same owner_id-scoped RLS, same `key` (stable) vs `label`
// (editable) split, so a pipeline customized on one side shows up
// correctly on the other (same Supabase project, "one shared database,
// not a local copy that needs syncing"). See that file's own comments for
// the full reasoning; kept in sync by hand across the two codebases.
export type StageType = 'open' | 'won' | 'lost';

export interface PipelineStage {
  id: string;
  owner_id: string;
  key: string;
  label: string;
  type: StageType;
  sort_order: number;
  created_at: string;
}

export const DEFAULT_STAGES: Array<Pick<PipelineStage, 'key' | 'label' | 'type' | 'sort_order'>> = [
  { key: 'lead', label: 'New Lead', type: 'open', sort_order: 0 },
  { key: 'meeting', label: 'Meeting Booked', type: 'open', sort_order: 1 },
  { key: 'negotiation', label: 'Negotiating', type: 'open', sort_order: 2 },
  { key: 'won', label: 'Won', type: 'won', sort_order: 3 },
  { key: 'lost', label: 'Lost', type: 'lost', sort_order: 4 },
];

// Keys the desktop backend's automatic deal-stage advancement targets
// directly (raptor/core/crm_promotion.py, raptor/outreach/deal_sync.py).
// 'negotiation' has no such dependency and is freely deletable.
export const RESERVED_KEYS = new Set(['lead', 'meeting', 'won', 'lost']);

function sortStages(rows: PipelineStage[]): PipelineStage[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

export async function loadPipelineStages(): Promise<PipelineStage[]> {
  const { data, error } = await supabase.from('pipeline_stages').select('*');
  if (error) throw error;
  if (data && data.length > 0) return sortStages(data as PipelineStage[]);

  const { error: seedError } = await supabase.from('pipeline_stages').insert(DEFAULT_STAGES);
  if (seedError && seedError.code !== '23505') throw seedError; // 23505 = unique_violation, another tab already seeded

  const { data: reloaded, error: reloadError } = await supabase.from('pipeline_stages').select('*');
  if (reloadError) throw reloadError;
  return sortStages((reloaded || []) as PipelineStage[]);
}

export function stageByKey(stages: PipelineStage[], key: string): PipelineStage | null {
  return stages.find((s) => s.key === key) || null;
}

export function openStageKeys(stages: PipelineStage[]): string[] {
  return stages.filter((s) => s.type === 'open').map((s) => s.key);
}

export function wonStageKeys(stages: PipelineStage[]): string[] {
  return stages.filter((s) => s.type === 'won').map((s) => s.key);
}

export async function createStage(label: string, type: StageType): Promise<void> {
  const key =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `stage_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  const nextOrder = (data && data[0] ? data[0].sort_order : -1) + 1;
  const { error: insertError } = await supabase
    .from('pipeline_stages')
    .insert({ key, label: label.trim(), type, sort_order: nextOrder });
  if (insertError) throw insertError;
}

export async function renameStage(stage: PipelineStage, label: string): Promise<void> {
  const { error } = await supabase.from('pipeline_stages').update({ label: label.trim() }).eq('id', stage.id);
  if (error) throw error;
}

export async function reorderStages(orderedStages: PipelineStage[]): Promise<void> {
  for (let i = 0; i < orderedStages.length; i++) {
    const { error } = await supabase.from('pipeline_stages').update({ sort_order: i }).eq('id', orderedStages[i].id);
    if (error) throw error;
  }
}

// Deletes a stage. If any deals are currently on it, they're moved to
// replacementKey first - same "keep existing, just lose the specific
// link" spirit as everywhere else in this CRM deletes something shared.
export async function deleteStage(stage: PipelineStage, replacementKey: string | null): Promise<void> {
  const { data: linked, error: linkedError } = await supabase.from('deals').select('id').eq('stage', stage.key);
  if (linkedError) throw linkedError;
  if (linked && linked.length > 0) {
    if (!replacementKey) throw new Error('This stage has deals on it - choose where they should move first.');
    const { error: moveError } = await supabase.from('deals').update({ stage: replacementKey }).eq('stage', stage.key);
    if (moveError) throw moveError;
  }
  const { error } = await supabase.from('pipeline_stages').delete().eq('id', stage.id);
  if (error) throw error;
}
