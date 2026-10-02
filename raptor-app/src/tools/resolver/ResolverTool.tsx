import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('resolver')!;
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
    if (!ip) return showToast('Enter an IP address first', 'error');
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
    if (!raw) return showToast('Add at least one company row first', 'error');
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
      showToast('Your company list was saved', 'success');
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
      showToast('Could not load your past lookups', 'error');
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
        <div className={`arsenal-tab${tab === 'resolve' ? ' active' : ''}`} onClick={() => switchTab('resolve')}>Look up an address</div>
        <div className={`arsenal-tab${tab === 'ranges' ? ' active' : ''}`} onClick={() => switchTab('ranges')}>Your company list</div>
        <div className={`arsenal-tab${tab === 'visits' ? ' active' : ''}`} onClick={() => switchTab('visits')}>Past lookups</div>
      </div>

      {tab === 'resolve' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Which company is this?</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field">
                <label className="arsenal-label">Visitor’s IP address</label>
                <input className="arsenal-input" value={lookupIp} onChange={(e) => setLookupIp(e.target.value)} placeholder="203.0.113.42" />
              </div>
              <button className="arsenal-btn" disabled={resolveLoading} onClick={runResolve}>
                {resolveLoading ? (<><span className="arsenal-spinner" /> Looking…</>) : 'Find the company →'}
              </button>
            </div>
          </div>
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
            <div className="arsenal-card-body">
              {!resolveResult ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">Enter an IP address to see which company it belongs to.</div>
                </div>
              ) : resolveResult.matched ? (
                <div className="arsenal-stats">
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Company</div>
                    <div className="arsenal-stat-value accent" style={{ fontSize: '1.4rem' }}>{resolveResult.company_name}</div>
                  </div>
                </div>
              ) : (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">✗</div>
                  <div className="arsenal-empty-text">{resolveResult.ip} isn’t in your company list, so we can’t say who it is.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'ranges' && (
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Tell us which companies own which addresses</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">One company per line: address range, then company name</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 180 }}
                value={rangesInput}
                onChange={(e) => setRangesInput(e.target.value)}
                placeholder={'203.0.113.0/24,Panchshil Realty\n198.51.100.0/22,Kolte-Patil'}
              />
              <div className="arsenal-hint">Free. A company’s address range looks like 203.0.113.0/24 (your IT contact or the company’s provider can tell you). The lookup only recognises companies you list here.</div>
            </div>
            <button className="arsenal-btn" disabled={uploadLoading} onClick={runUpload}>
              {uploadLoading ? (<><span className="arsenal-spinner" /> Saving…</>) : 'Save my list →'}
            </button>
            {uploadResult && (
              <div style={{ marginTop: '1rem' }}>
                <span className="arsenal-badge ok"><span className="dot" />{uploadResult.inserted} saved</span>
                {uploadResult.invalid.length > 0 && (
                  <span className="arsenal-badge fail" style={{ marginLeft: '0.6rem' }}>
                    <span className="dot" />{uploadResult.invalid.length} rows skipped (couldn’t read them)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Recent lookups</span></div>
          <div className="arsenal-card-body">
            {visitsLoading ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">Loading…</div></div>
            ) : !visits || visits.length === 0 ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">No lookups yet.</div></div>
            ) : (
              <table className="arsenal-table">
                <thead><tr><th>Address</th><th>Company</th><th>Where from</th><th>When</th></tr></thead>
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