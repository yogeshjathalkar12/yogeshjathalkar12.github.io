import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('resolver')!;
// NOTE: resolver.html hit `${RAPTOR_API_URL}/api/resolver` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/resolver` —
// confirm that's actually where the backend route lives.
const API = toolApiBase('resolver');

type Tab = 'resolve' | 'ranges' | 'visits';

interface ResolveResponse {
  matched: boolean;
  company_name?: string;
  ip: string;
  credits_left?: number;
}

interface UploadRangesResponse {
  inserted: number;
  invalid: string[];
}

interface Visit {
  ip: string;
  company_name?: string;
  source: string;
  created_at: string;
}

export default function ResolverTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('resolve');

  // Resolve
  const [lookupIp, setLookupIp] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolveResponse | null>(null);

  // Ranges upload
  const [rangesInput, setRangesInput] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadRangesResponse | null>(null);

  // Visits
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const runResolve = async () => {
    const ip = lookupIp.trim();
    if (!ip) return showToast('Enter an IP address', 'error');
    setResolveLoading(true);
    try {
      const json = await authedFetch<ResolveResponse>(`${API}/resolve?ip=${encodeURIComponent(ip)}`);
      setResolveResult(json);
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setResolveLoading(false);
    }
  };

  const runUpload = async () => {
    const raw = rangesInput.trim();
    if (!raw) return showToast('Paste at least one CIDR row', 'error');
    const ranges = raw
      .split('\n')
      .map((line) => {
        const [cidr, ...rest] = line.split(',');
        return { cidr: (cidr || '').trim(), company_name: rest.join(',').trim() };
      })
      .filter((r) => r.cidr);

    setUploadLoading(true);
    try {
      const json = await authedFetch<UploadRangesResponse>(`${API}/ranges/upload`, {
        method: 'POST',
        body: JSON.stringify({ ranges }),
        skipCreditsSync: true,
      });
      setUploadResult(json);
      showToast('CIDR ranges uploaded', 'success');
    } catch (e) {
      if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  const loadVisits = async () => {
    setVisitsLoading(true);
    try {
      const json = await authedFetch<{ visits: Visit[] }>(`${API}/visits`, { skipCreditsSync: true });
      setVisits(json.visits || []);
    } catch {
      showToast('Could not load visit log', 'error');
    } finally {
      setVisitsLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'visits' && visits === null) loadVisits();
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-tabs">
        <div className={`arsenal-tab${tab === 'resolve' ? ' active' : ''}`} onClick={() => switchTab('resolve')}>Resolve IP</div>
        <div className={`arsenal-tab${tab === 'ranges' ? ' active' : ''}`} onClick={() => switchTab('ranges')}>Upload CIDR Ranges</div>
        <div className={`arsenal-tab${tab === 'visits' ? ' active' : ''}`} onClick={() => switchTab('visits')}>Visit Log</div>
      </div>

      {tab === 'resolve' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Lookup</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field">
                <label className="arsenal-label">Visitor IP Address</label>
                <input className="arsenal-input" value={lookupIp} onChange={(e) => setLookupIp(e.target.value)} placeholder="203.0.113.42" />
              </div>
              <button className="arsenal-btn" disabled={resolveLoading} onClick={runResolve}>
                {resolveLoading ? (<><span className="arsenal-spinner" /> Matching CIDR blocks…</>) : 'Resolve →'}
              </button>
            </div>
          </div>
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
            <div className="arsenal-card-body">
              {!resolveResult ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">Resolve an IP to see the matched company.</div>
                </div>
              ) : resolveResult.matched ? (
                <div className="arsenal-stats">
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Matched Company</div>
                    <div className="arsenal-stat-value accent" style={{ fontSize: '1.4rem' }}>{resolveResult.company_name}</div>
                  </div>
                </div>
              ) : (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">✗</div>
                  <div className="arsenal-empty-text">No CIDR range in your table covers {resolveResult.ip}.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'ranges' && (
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Upload CIDR → Company Map (CSV or JSON)</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Paste rows: one per line, "cidr,company_name"</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 180 }}
                value={rangesInput}
                onChange={(e) => setRangesInput(e.target.value)}
                placeholder={'203.0.113.0/24,Panchshil Realty\n198.51.100.0/22,Kolte-Patil'}
              />
              <div className="arsenal-hint">Free — this is your own reference data, not a paid lookup.</div>
            </div>
            <button className="arsenal-btn" disabled={uploadLoading} onClick={runUpload}>
              {uploadLoading ? (<><span className="arsenal-spinner" /> Uploading…</>) : 'Upload Ranges →'}
            </button>
            {uploadResult && (
              <div style={{ marginTop: '1rem' }}>
                <span className="arsenal-badge ok"><span className="dot" />{uploadResult.inserted} ranges loaded</span>
                {uploadResult.invalid.length > 0 && (
                  <span className="arsenal-badge fail" style={{ marginLeft: '0.6rem' }}>
                    <span className="dot" />{uploadResult.invalid.length} invalid rows skipped
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Recent Resolved Visits</span></div>
          <div className="arsenal-card-body">
            {visitsLoading ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">Loading…</div></div>
            ) : !visits || visits.length === 0 ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">No resolved visits yet.</div></div>
            ) : (
              <table className="arsenal-table">
                <thead><tr><th>IP</th><th>Company</th><th>Source</th><th>Time</th></tr></thead>
                <tbody>
                  {visits.map((v, i) => (
                    <tr key={i}>
                      <td>{v.ip}</td>
                      <td style={{ color: 'var(--white)' }}>{v.company_name || '—'}</td>
                      <td>{v.source}</td>
                      <td>{new Date(v.created_at).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}