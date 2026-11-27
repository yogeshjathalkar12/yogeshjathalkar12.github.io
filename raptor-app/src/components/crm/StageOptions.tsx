import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { type Pipeline, loadPipelines, stageGroups } from '../../lib/pipelines';
import type { PipelineStage } from '../../lib/pipelineStages';

// The choices of a stage list: grouped by pipeline when there is more than one.
export default function StageOptions({ stages }: { stages: PipelineStage[] }) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  useEffect(() => { loadPipelines(supabase).then(setPipelines).catch(() => undefined); }, []);
  const groups = stageGroups(stages, pipelines);
  if (groups.length < 2) return <>{stages.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}</>;
  return <>{groups.map((g) => <optgroup key={g.id || 'main'} label={g.name}>{g.stages.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}</optgroup>)}</>;
}
