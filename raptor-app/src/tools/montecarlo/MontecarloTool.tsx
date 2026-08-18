import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

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

interface SimRun {
  deal_count: number;
  p10: number;
  p50: number;
  p90: number;
  created_at: string;
}

const DEFAULT_DEALS = JSON.stringify(
  [
    { name: 'Acme Corp', value: 400000, probability: 0.4 },
    { name: 'BigRetail Ltd', value: 850000, probability: 0.55 },
    { name: 'CloudTech Inc', value: 500000, probability: 0.75 },
  ],
  null,
  0,
);

export default function MontecarloTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [dealsInput, setDealsInput] = useState(DEFAULT_DEALS);
  const [iterations, setIterations] = useState(10000);
  const [buckets, setBuckets] = useState(20);

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

  const runSimulate = async () => {
    const dealsStr = dealsInput.trim();
    if (!dealsStr) return showToast('Enter deals', 'error');

    let deals: unknown;
    try {
      deals = JSON.parse(dealsStr);
    } catch {
      return showToast('Invalid JSON format', 'error');
    }
    if (!Array.isArray(deals) || !deals.length) return showToast('Deals must be a non-empty array', 'error');

    setLoading(true);
    try {
      const json = await authedFetch<SimulateResponse>(`${API}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ deals, iterations: iterations || 10000, bucket_count: buckets || 20 }),
      });
      setResult(json);
      loadHistory();
      showToast('Simulation complete', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const maxHeight = result ? Math.max(...result.histogram.map((b) => b.count), 1) : 1;

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Pipeline</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Deals (JSON format)</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 200 }}
                value={dealsInput}
                onChange={(e) => setDealsInput(e.target.value)}
                placeholder='[{"name":"Panchshil Realty","value":400000,"probability":0.4}]'
              />
              <div className="arsenal-hint">Each deal needs: name (string), value (number), probability (0-1 float).</div>
            </div>
            <div className="arsenal-field-row">
              <div className="arsenal-field">
                <label className="arsenal-label">Iterations</label>
                <input
                  className="arsenal-input"
                  type="number"
                  min={100}
                  max={50000}
                  value={iterations}
                  onChange={(e) => setIterations(parseInt(e.target.value) || 10000)}
                />
              </div>
              <div className="arsenal-field" style={{ maxWidth: 120 }}>
                <label className="arsenal-label">Histogram Buckets</label>
                <input
                  className="arsenal-input"
                  type="number"
                  min={5}
                  max={50}
                  value={buckets}
                  onChange={(e) => setBuckets(parseInt(e.target.value) || 20)}
                />
              </div>
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runSimulate}>
              {loading ? (<><span className="arsenal-spinner" /> Running iterations…</>) : 'Simulate Pipeline →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Distribution</span></div>
          <div className="arsenal-card-body">
            {!result ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Run a simulation to see P10/P50/P90.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats" style={{ marginBottom: '1.5rem' }}>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">P10 (Worst)</div>
                    <div className="arsenal-stat-value">${(result.p10_worst_case || 0).toLocaleString()}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">P50 (Expected)</div>
                    <div className="arsenal-stat-value accent">${(result.p50_expected || 0).toLocaleString()}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">P90 (Best)</div>
                    <div className="arsenal-stat-value">${(result.p90_best_case || 0).toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--dim2)', marginBottom: '0.5rem' }}>
                    Simulated Histogram ({result.iterations} iterations)
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
                  <div className="arsenal-console-line"><span className="ts">Deals</span><span className="msg">{result.deal_count}</span></div>
                  <div className="arsenal-console-line ok"><span className="ts">Expected (naive)</span><span className="msg">${(result.expected_value_naive || 0).toLocaleString()}</span></div>
                  <div className="arsenal-console-line ok"><span className="ts">Simulated Mean</span><span className="msg">${(result.simulated_mean || 0).toLocaleString()}</span></div>
                  <div className="arsenal-console-line"><span className="ts">Absolute Worst</span><span className="msg">${(result.absolute_worst || 0).toLocaleString()}</span></div>
                  <div className="arsenal-console-line"><span className="ts">Absolute Best</span><span className="msg">${(result.absolute_best || 0).toLocaleString()}</span></div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Past Simulations</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<SimRun>
            rows={history}
            keyField={(r) => r.created_at}
            emptyText="No simulations run yet."
            columns={[
              { header: 'Deals', render: (r) => r.deal_count },
              { header: 'P10', render: (r) => `$${(r.p10 || 0).toLocaleString()}` },
              { header: 'P50', render: (r) => <strong style={{ color: 'var(--purple)' }}>${(r.p50 || 0).toLocaleString()}</strong> },
              { header: 'P90', render: (r) => `$${(r.p90 || 0).toLocaleString()}` },
              { header: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}