// lib/pipelines.ts
// More than one pipeline (db/migrations/2026-11-28_g_pipelines.sql). A stage belongs to a pipeline; one without belongs to the main
// pipeline. A deal is in the pipeline its stage is in.

export interface Pipeline { id: string; name: string; sort_order: number }
export const MAIN = '';                     // the id used for the main pipeline in screens
export const MAIN_NAME = 'Main pipeline';

type Staged = { pipeline_id?: string | null; sort_order: number; key: string; label: string };

export const pipelineOf = (stage: { pipeline_id?: string | null }): string => stage.pipeline_id || MAIN;

export const stagesOf = <S extends Staged>(stages: S[], pipelineId: string): S[] =>
  stages.filter((s) => pipelineOf(s) === pipelineId).sort((a, b) => a.sort_order - b.sort_order);

/** The stages of every pipeline, main first, for a grouped list. A stage of a pipeline that is not known goes with the main one. */
export function stageGroups<S extends Staged>(stages: S[], pipelines: Pipeline[]): { id: string; name: string; stages: S[] }[] {
  const known = new Set(pipelines.map((p) => p.id));
  const groups = [{ id: MAIN, name: MAIN_NAME }, ...[...pipelines].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))]
    .map((p) => ({ id: p.id, name: p.name, stages: stagesOf(stages.map((s) => (s.pipeline_id && !known.has(s.pipeline_id) ? { ...s, pipeline_id: null } : s)), p.id) }));
  return groups.filter((g) => g.stages.length > 0);
}

/** "Negotiating", or "Partners · Intro" once there is more than one pipeline. */
export function stageChoices<S extends Staged>(stages: S[], pipelines: Pipeline[]): [string, string][] {
  const groups = stageGroups(stages, pipelines);
  return groups.flatMap((g) => g.stages.map((s) => [s.key, groups.length > 1 ? `${g.name} · ${s.label}` : s.label] as [string, string]));
}

export const STARTER_STAGES: [string, 'open' | 'won' | 'lost'][] = [['New', 'open'], ['In progress', 'open'], ['Won', 'won'], ['Lost', 'lost']];

/** Empty when the database part is not installed. */
export async function loadPipelines(db: any): Promise<Pipeline[]> {
  const { data, error } = await db.from('pipelines').select('id, name, sort_order').order('sort_order', { ascending: true });
  return error ? [] : ((data || []) as Pipeline[]);
}

export async function createPipeline(db: any, name: string, existing: number, newKey: () => string = () => crypto.randomUUID()): Promise<string> {
  const { data, error } = await db.from('pipelines').insert({ name: name.trim(), sort_order: existing }).select('id').single();
  if (error) throw error;
  const rows = STARTER_STAGES.map(([label, type], sort_order) => ({ key: newKey(), label, type, sort_order, pipeline_id: data.id }));
  const { error: stageError } = await db.from('pipeline_stages').insert(rows);
  if (stageError) {                                      // a pipeline without stages would be invisible: take it back
    await db.from('pipelines').delete().eq('id', data.id);
    throw stageError;
  }
  return data.id as string;
}
