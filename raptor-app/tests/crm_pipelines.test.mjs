// Run with:  node --test tests/crm_pipelines.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN, createPipeline, stageChoices, stageGroups, stagesOf } from '../src/lib/pipelines.ts';
import { stageProbability } from '../src/lib/forecast.ts';

const stage = (key, sort_order, pipeline_id = null, type = 'open') => ({ id: key, key, label: key.toUpperCase(), sort_order, pipeline_id, type });
const STAGES = [stage('b', 1), stage('a', 0), stage('r2', 1, 'ren'), stage('r1', 0, 'ren'), stage('lost-pipe', 5, 'nope')];
const PIPES = [{ id: 'ren', name: 'Renewals', sort_order: 1 }];

test('each pipeline has its own stages in order; a stage of an unknown pipeline stays reachable in the main one', () => {
  assert.deepEqual(stagesOf(STAGES, MAIN).map((s) => s.key), ['a', 'b']);
  assert.deepEqual(stagesOf(STAGES, 'ren').map((s) => s.key), ['r1', 'r2']);
  assert.deepEqual(stageGroups(STAGES, PIPES).map((g) => [g.name, g.stages.map((s) => s.key)]), [['Main pipeline', ['a', 'b', 'lost-pipe']], ['Renewals', ['r1', 'r2']]]);
});

test('stage names carry the pipeline only when there is more than one', () => {
  assert.deepEqual(stageChoices([stage('a', 0)], []), [['a', 'A']]);
  assert.deepEqual(stageChoices([stage('a', 0), stage('r1', 0, 'ren')], PIPES), [['a', 'Main pipeline · A'], ['r1', 'Renewals · R1']]);
});

test('the chance of a stage is worked out within its own pipeline', () => {
  assert.equal(stageProbability(STAGES[1], STAGES), 33);          // first of the two main stages and nothing else counted from Renewals
  assert.equal(stageProbability(STAGES[3], STAGES), 33);
});

test('a new pipeline gets starting stages, and is taken back if they cannot be made', async () => {
  const log = [];
  const db = (stageError) => ({ from: (t) => ({
    insert: (rows) => ({ select: () => ({ single: async () => { log.push([t, rows]); return { data: { id: 'new' }, error: null }; } }), then: (ok) => { log.push([t, rows]); return Promise.resolve({ error: stageError }).then(ok); } }),
    delete: () => ({ eq: async (_c, v) => { log.push(['delete', t, v]); return { error: null }; } }),
  }) });
  let n = 0;
  assert.equal(await createPipeline(db(null), ' Renewals ', 2, () => `k${n++}`), 'new');
  assert.deepEqual(log[0][1], { name: 'Renewals', sort_order: 2 });
  assert.deepEqual(log[1][1].map((r) => [r.key, r.type, r.pipeline_id]), [['k0', 'open', 'new'], ['k1', 'open', 'new'], ['k2', 'won', 'new'], ['k3', 'lost', 'new']]);
  log.length = 0;
  await assert.rejects(() => createPipeline(db({ message: 'no' }), 'X', 1, () => 'k'));
  assert.deepEqual(log.at(-1), ['delete', 'pipelines', 'new']);
});
