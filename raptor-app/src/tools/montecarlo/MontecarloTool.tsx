import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';
import { formatCurrency } from '../../lib/crmHelpers';
import { supabase } from '../../lib/supabaseClient';
import { loadPipelineStages, openStageKeys } from '../../lib/pipelineStages';

const TOOL = findTool('montecarlo')!;
// NOTE: montecarlo.html hit `${RAPTOR_API_URL}/api/montecarlo` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/montecarlo` —
// confirm that's actually where the backend route lives.
const API = toolApiBase('montecarlo');

interface HistogramBucket {
  count: number;
}

interface SimulateResponse {
  p10_worst_case: number;
  p50_expected: number;
  p90_best_case: number;
  histogram: HistogramBucket[];
  iterations: number;
  deal_count: number;
  expected_value_naive: number;
  simulated_mean: number;
  absolute_worst: number;
  absolute_best: number;
  credits_left?: number;
}

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'failed';
  result: SimulateResponse | null;
  error: string | null;
}

interface SimRun {
  deal_count: number;
  p10: number;
  p50: number;
  p90: number;
  created_at: string;
}

interface DealRow { name: string; value: string; chance: string }

const EXAMPLE_DEALS: DealRow[] = [
  { name: 'Acme Corp', value: '400000', chance: '40' },
  { name: 'BigRetail Ltd', value: '850000', chance: '55' },
  { name: 'CloudTech Inc', value: '500000', chance: '75' },
];

export default function MontecarloTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [dealRows, setDealRows] = useState<DealRow[]>(EXAMPLE_DEALS);
  const [loadingDeals, setLoadingDeals] = useState(false);
  // How many what-if scenarios to run and how finely to draw the chart: not
  // worth asking a salesperson, so they're fixed.
  const iterations = 10000;
  const buckets = 20;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [history, setHistory] = useState<SimRun[] | null>(null);

  const loadHistory = async () => {
    try {
      const json = await authedFetch<{ runs: SimRun[] }>(`${API}/history`, {
        skipCreditsSync: true,
      });
      setHistory(json.runs || []);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /simulate returns {job_id, status: "queued"} immediately — the actual
  // result comes from polling GET /job/{job_id} once the background task
  // (see montecarlo_router.py's BackgroundTasks pattern) finishes.
  const MAX_POLL_ATTEMPTS = 60; // ~90s at 1.5s/poll — well past any realistic run time

  const pollJob = async (jobId: string, attempt = 0) => {
    let job: JobStatus;
    try {
      job = await authedFetch<JobStatus>(`${API}/job/${jobId}`, { skipCreditsSync: true });
    } catch (e) {
      setLoading(false);
      if (e instanceof Error) showToast(e.message, 'error');
      return;
    }

    if (job.status === 'done' && job.result) {
      setResult(job.result);
      loadHistory();
      showToast('Your forecast is ready', 'success');
      setLoading(false);
      return;
    }
    if (job.status === 'failed') {
      showToast(job.error || 'Something went wrong with the forecast. Please try again.', 'error');
      setLoading(false);
      return;
    }
    if (attempt >= MAX_POLL_ATTEMPTS) {
      showToast('This is taking longer than usual — check “Past forecasts” in a minute', 'error');
      setLoading(false);
      return;
    }
    setTimeout(() => pollJob(jobId, attempt + 1), 1500);
  };

  // Pulls the open deals from the CRM. The CRM has no "chance of winning" per
  // deal, so we suggest one from how far along its stage is (earliest stage
  // ~15%, last open stage ~75%) - editable, and said so on screen.
  const loadMyDeals = async () => {
    setLoadingDeals(true);
    try {
      const stages = await loadPipelineStages();
      const openKeys = openStageKeys(stages);
      const { data, error } = await supabase.from('deals').select('title, value, stage').in('stage', openKeys.length ? openKeys : ['lead']);
      if (error) throw error;
      const rows = (data || []).filter((d: any) => Number(d.value) > 0).map((d: any) => {
        const pos = Math.max(0, openKeys.indexOf(d.stage));
        const chance = Math.round(15 + (openKeys.length > 1 ? pos / (openKeys.length - 1) : 0.5) * 60);
        return { name: d.title || 'Deal', value: String(d.value), chance: String(chance) };
      });
      if (!rows.length) return showToast('You have no open deals with a value yet', 'error');
      setDealRows(rows.slice(0, 500));
    } catch {
      showToast('Could not load your deals', 'error');
    } finally {
      setLoadingDeals(false);
    }
  };

  const updateRow = (i: number, patch: Partial<DealRow>) => setDealRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const runSimulate = async () => {
    const deals = dealRows
      .filter((r) => r.name.trim() || r.value.trim())
      .map((r) => ({ name: r.name.trim() || 'Deal', value: Number(r.value), probability: Number(r.chance) / 100 }));
    if (!deals.length) return showToast('Add at least one deal', 'error');
    if (deals.some((d) => !Number.isFinite(d.value) || d.value < 0)) return showToast('Every deal needs a value (a number)', 'error');
    if (deals.some((d) => !Number.isFinite(d.probability) || d.probability < 0 || d.probability > 1)) return showToast('Chance of winning must be between 0 and 100', 'error');

    setLoading(true);
    try {
      const json = await authedFetch<{ job_id: string; status: string; credits_left?: number }>(`${API}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ deals, iterations: iterations || 10000, bucket_count: buckets || 20 }),
      });
      pollJob(json.job_id);
    } catch (e) {
      setLoading(false);
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    }
  };

  const maxHeight = result ? Math.max(...result.histogram.map((b) => b.count), 1) : 1;

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Your deals</span></div>
          <div className="arsenal-card-body">
            <button className="arsenal-btn arsenal-btn-secondary" style={{ marginBottom: '1rem' }} disabled={loadingDeals} onClick={loadMyDeals}>
              {loadingDeals ? (<><span className="arsenal-spinner" /> Loading…</>) : 'Use my open deals from the CRM'}
            </button>
            <div className="arsenal-hint" style={{ marginBottom: '0.8rem' }}>
              Your deals, how much each is worth, and how likely you think you are to win it. When you load them from the CRM we guess the chance from how far along each deal is — change any to match your own experience.
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: '0.8rem' }}>
              {dealRows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <input className="arsenal-input" style={{ flex: 2 }} placeholder="Deal or company" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
                  <input className="arsenal-input" style={{ flex: 1 }} type="number" min={0} placeholder="Worth" value={r.value} onChange={(e) => updateRow(i, { value: e.target.value })} />
                  <input className="arsenal-input" style={{ width: 80 }} type="number" min={0} max={100} placeholder="% win" title="Chance of winning, 0-100" value={r.chance} onChange={(e) => updateRow(i, { chance: e.target.value })} />
                  <button className="arsenal-copy-btn" onClick={() => setDealRows((rows) => rows.filter((_, idx) => idx !== i))} title="Remove">✕</button>
                </div>
              ))}
            </div>
            <button className="arsenal-copy-btn" style={{ marginBottom: '1rem' }} onClick={() => setDealRows((rows) => [...rows, { name: '', value: '', chance: '50' }])}>+ Add a deal</button>
            <button className="arsenal-btn" disabled={loading} onClick={runSimulate}>
              {loading ? (<><span className="arsenal-spinner" /> Running scenarios…</>) : 'Forecast my revenue →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">What you can expect</span></div>
          <div className="arsenal-card-body">
            {!result ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Add your deals and run the forecast to see a realistic range.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats" style={{ marginBottom: '1.5rem' }}>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Bad month</div>
                    <div className="arsenal-stat-value">{formatCurrency(result.p10_worst_case)}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Most likely</div>
                    <div className="arsenal-stat-value accent">{formatCurrency(result.p50_expected)}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Great month</div>
                    <div className="arsenal-stat-value">{formatCurrency(result.p90_best_case)}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--dim2)', marginBottom: '0.5rem' }}>
                    How often each total came up, across {result.iterations.toLocaleString()} what-if scenarios (taller = more likely)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                    {result.histogram.map((b, i) => (
                      <div
                        key={i}
                        title={`${b.count} outcomes`}
                        style={{
                          flex: 1,
                          height: `${maxHeight > 0 ? (b.count / maxHeight) * 100 : 0}%`,
                          background: 'linear-gradient(to top, var(--purple), var(--pink))',
                          opacity: 0.7,
                          borderRadius: 2,
                          minHeight: 2,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="arsenal-console" style={{ fontSize: '0.65rem' }}>
                  <div className="arsenal-console-line"><span className="ts">Deals included</span><span className="msg">{result.deal_count}</span></div>
                  <div className="arsenal-console-line ok"><span className="ts">Simple estimate (value × chance)</span><span className="msg">{formatCurrency(result.expected_value_naive)}</span></div>
                  <div className="arsenal-console-line ok"><span className="ts">Average across scenarios</span><span className="msg">{formatCurrency(result.simulated_mean)}</span></div>
                  <div className="arsenal-console-line"><span className="ts">Worst case (win nothing)</span><span className="msg">{formatCurrency(result.absolute_worst)}</span></div>
                  <div className="arsenal-console-line"><span className="ts">Best case (win everything)</span><span className="msg">{formatCurrency(result.absolute_best)}</span></div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Past forecasts</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<SimRun>
            rows={history}
            keyField={(r) => r.created_at}
            emptyText="No forecasts yet."
            columns={[
              { header: 'Deals', render: (r) => r.deal_count },
              { header: 'Bad', render: (r) => formatCurrency(r.p10) },
              { header: 'Likely', render: (r) => <strong style={{ color: 'var(--purple)' }}>{formatCurrency(r.p50)}</strong> },
              { header: 'Great', render: (r) => formatCurrency(r.p90) },
              { header: 'When', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}