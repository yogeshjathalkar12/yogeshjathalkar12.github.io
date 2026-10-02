import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('kmeans')!;
const API = toolApiBase('kmeans');

type CsvRow = Record<string, string | number>;

interface ClusterMember {
  label?: string;
  row: CsvRow;
}

interface Cluster {
  cluster_id: number;
  size: number;
  centroid: Record<string, number>;
  members: ClusterMember[];
}

interface ClusterResponse {
  clusters: Cluster[];
  credits_left?: number;
}

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'failed';
  result: ClusterResponse | null;
  error: string | null;
}

interface ClusterRun {
  k: number;
  fields: string[];
  row_count: number;
  created_at: string;
}

// Splits one line into cells, respecting "quoted, values" so an amount like
// "4,200,000" stays one cell.
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('Paste a first line with the column names, then at least one row of customers.');
  const headers = splitLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      const val = cells[idx] ?? '';
      // "$4,200" / "₹ 12,00,000" / "80" all count as numbers
      const cleaned = val.replace(/[₹$€£,\s]/g, '');
      const numVal = cleaned === '' ? NaN : Number(cleaned);
      row[h] = Number.isNaN(numVal) ? val : numVal;
    });
    rows.push(row);
  }
  return rows;
}

export default function KmeansTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [csvInput, setCsvInput] = useState('');
  const [clusterFields, setClusterFields] = useState('');
  const [kValue, setKValue] = useState(3);
  const [labelField, setLabelField] = useState('');

  const [loading, setLoading] = useState(false);
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [history, setHistory] = useState<ClusterRun[] | null>(null);

  const loadHistory = async () => {
    try {
      const json = await authedFetch<{ runs: ClusterRun[] }>(`${API}/history`, {
        skipCreditsSync: true,
      });
      setHistory(json.runs || []);
    } catch {
      // non-fatal — table just shows its own empty state
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /cluster returns {job_id, status: "queued"} immediately — the actual
  // clusters come from polling GET /job/{job_id} once the background task
  // (see kmeans_router.py's BackgroundTasks pattern) finishes.
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
      setClusters(job.result.clusters || []);
      loadHistory();
      showToast('Your customer groups are ready', 'success');
      setLoading(false);
      return;
    }
    if (job.status === 'failed') {
      showToast(job.error || 'Something went wrong while grouping your customers. Please try again.', 'error');
      setLoading(false);
      return;
    }
    if (attempt >= MAX_POLL_ATTEMPTS) {
      showToast('This is taking longer than usual — check “Past groupings” in a minute', 'error');
      setLoading(false);
      return;
    }
    setTimeout(() => pollJob(jobId, attempt + 1), 1500);
  };

  const runCluster = async () => {
    const csvText = csvInput.trim();
    const fieldsStr = clusterFields.trim();
    if (!csvText) return showToast('Paste your customer list first', 'error');
    if (!fieldsStr) return showToast('Say which columns to compare customers by', 'error');

    let rows: CsvRow[];
    try {
      rows = parseCSV(csvText);
    } catch (e) {
      if (e instanceof Error) showToast(e.message, 'error');
      return;
    }

    const fields = fieldsStr.split(',').map((f) => f.trim());
    for (const f of fields) {
      if (!Object.prototype.hasOwnProperty.call(rows[0], f)) {
        return showToast(`There is no column called "${f}" in your list`, 'error');
      }
    }

    setLoading(true);
    try {
      const json = await authedFetch<{ job_id: string; status: string; credits_left?: number }>(`${API}/cluster`, {
        method: 'POST',
        body: JSON.stringify({ rows, fields, k: kValue || 3, label_field: labelField.trim() || null }),
      });
      pollJob(json.job_id);
    } catch (e) {
      setLoading(false);
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Your customers</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Paste your customer list</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 180 }}
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder={'company,revenue,employees\nAcme Corp,4200000,80\nTechVentures Inc,8500000,120'}
              />
              <div className="arsenal-hint">Copy it from a spreadsheet. The first line must be the column names; each line after is one customer. Amounts like $4,200 are fine.</div>
            </div>
            <div className="arsenal-field-row">
              <div className="arsenal-field">
                <label className="arsenal-label">Compare customers by (column names)</label>
                <input className="arsenal-input" value={clusterFields} onChange={(e) => setClusterFields(e.target.value)} placeholder="revenue,employees" />
              </div>
              <div className="arsenal-field" style={{ maxWidth: 100 }}>
                <label className="arsenal-label">How many groups</label>
                <input
                  className="arsenal-input"
                  type="number"
                  min={2}
                  max={10}
                  value={kValue}
                  onChange={(e) => setKValue(parseInt(e.target.value) || 3)}
                />
              </div>
            </div>
            <div className="arsenal-field">
              <label className="arsenal-label">Column with the customer’s name (optional)</label>
              <input className="arsenal-input" value={labelField} onChange={(e) => setLabelField(e.target.value)} placeholder="company" />
              <div className="arsenal-hint">So the results show names instead of raw numbers.</div>
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runCluster}>
              {loading ? (<><span className="arsenal-spinner" /> Grouping…</>) : 'Group my customers →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Your groups</span></div>
          <div className="arsenal-card-body">
            {!clusters || clusters.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Paste your customers to see the groups they fall into.</div>
              </div>
            ) : (
              clusters.map((cluster) => {
                const centroidStr = Object.entries(cluster.centroid)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ');
                return (
                  <div
                    key={cluster.cluster_id}
                    style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid var(--border)', background: 'rgba(168,85,247,0.03)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.2rem', color: 'var(--purple)' }}>
                        Group {cluster.cluster_id + 1}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--dim2)' }}><strong>{cluster.size}</strong> customers</div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
                      <strong>Typical customer in this group:</strong> {centroidStr}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim2)' }}>
                      {cluster.members.slice(0, 5).map((m, i) => (
                        <div key={i}>• {m.label || JSON.stringify(m.row).substring(0, 40)}</div>
                      ))}
                      {cluster.size > 5 && (
                        <div style={{ color: 'var(--dim)' }}>... and {cluster.size - 5} more</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Past groupings</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<ClusterRun>
            rows={history}
            keyField={(r) => r.created_at}
            emptyText="Nothing yet."
            columns={[
              { header: 'Groups', render: (r) => r.k },
              { header: 'Compared by', render: (r) => (r.fields || []).join(', ') },
              { header: 'Customers', render: (r) => r.row_count },
              { header: 'When', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}