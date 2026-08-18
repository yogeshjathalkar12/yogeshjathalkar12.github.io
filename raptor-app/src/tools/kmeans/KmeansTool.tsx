import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('kmeans')!;
// NOTE: kmeans.html hit `${RAPTOR_API_URL}/api/kmeans` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/kmeans` — confirm
// that's actually where the backend route lives before relying on this.
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

interface ClusterRun {
  k: number;
  fields: string[];
  row_count: number;
  created_at: string;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have header + at least one data row');
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      const val = cells[idx];
      const numVal = parseFloat(val);
      row[h] = isNaN(numVal) ? val : numVal;
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

  const runCluster = async () => {
    const csvText = csvInput.trim();
    const fieldsStr = clusterFields.trim();
    if (!csvText) return showToast('Paste CSV data', 'error');
    if (!fieldsStr) return showToast('Specify fields to cluster on', 'error');

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
        return showToast(`Field "${f}" not found in CSV`, 'error');
      }
    }

    setLoading(true);
    try {
      const json = await authedFetch<ClusterResponse>(`${API}/cluster`, {
        method: 'POST',
        body: JSON.stringify({ rows, fields, k: kValue || 3, label_field: labelField.trim() || null }),
      });
      setClusters(json.clusters || []);
      loadHistory();
      showToast('Clustering complete', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Upload Customer Data</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Paste CSV (one header row)</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 180 }}
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder={'company,revenue,employees\nAcme Corp,4200000,80\nTechVentures Inc,8500000,120'}
              />
              <div className="arsenal-hint">Paste rows with numeric and text columns. Select numeric columns below to cluster on.</div>
            </div>
            <div className="arsenal-field-row">
              <div className="arsenal-field">
                <label className="arsenal-label">Fields to Cluster (comma-sep)</label>
                <input className="arsenal-input" value={clusterFields} onChange={(e) => setClusterFields(e.target.value)} placeholder="revenue,employees" />
              </div>
              <div className="arsenal-field" style={{ maxWidth: 100 }}>
                <label className="arsenal-label">k (clusters)</label>
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
              <label className="arsenal-label">Label Field (optional)</label>
              <input className="arsenal-input" value={labelField} onChange={(e) => setLabelField(e.target.value)} placeholder="company" />
              <div className="arsenal-hint">Column to use as readable identifier for each row.</div>
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runCluster}>
              {loading ? (<><span className="arsenal-spinner" /> Computing k-means…</>) : 'Cluster & Segment →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
          <div className="arsenal-card-body">
            {!clusters || clusters.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Upload CSV data to see clusters.</div>
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
                        Cluster {cluster.cluster_id + 1}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--dim2)' }}>Size: <strong>{cluster.size}</strong></div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1rem' }}>
                      <strong>Centroid:</strong> {centroidStr}
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
        <div className="arsenal-card-header"><span className="arsenal-card-title">Clustering History</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<ClusterRun>
            rows={history}
            keyField={(r) => r.created_at}
            emptyText="No clustering runs yet."
            columns={[
              { header: 'K', render: (r) => r.k },
              { header: 'Fields', render: (r) => (r.fields || []).join(', ') },
              { header: 'Rows', render: (r) => r.row_count },
              { header: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}