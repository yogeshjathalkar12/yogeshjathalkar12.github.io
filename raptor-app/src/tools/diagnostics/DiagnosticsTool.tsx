import { Fragment, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('diagnostics')!;

// Backend: websites-api raptor/utility/diagnostic_router.py, mounted at /api/raptor/diagnostic.
const API = toolApiBase('diagnostic');

type Tab = 'bulk' | 'blacklist' | 'headers';

interface BulkResult {
  domain: string;
  mx: string[];
  spf: boolean;
  dmarc: boolean;
  verdict: 'healthy' | 'warn' | 'fail' | string;
  reasons: string[];
}

interface BulkResponse {
  results: BulkResult[];
  credits_left?: number;
}

interface BlacklistCheck {
  zone: string;
  listed: boolean | null;
}

interface BlacklistResponse {
  error?: string;
  mx_host: string;
  ip: string;
  listed_count: number;
  checks: BlacklistCheck[];
  credits_left?: number;
}

interface HeaderHop {
  from_host?: string;
  by_host?: string;
  ip?: string;
  timestamp?: string;
}

interface HeaderTraceResponse {
  hop_count: number;
  hops: HeaderHop[];
  likely_filter_hop?: (HeaderHop & { delay_seconds?: number }) | null;
  likely_filter_index?: number | null;
  credits_left?: number;
}

export default function DiagnosticsTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('bulk');

  // Bulk check state
  const [bulkDomains, setBulkDomains] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkOutOfCredits, setBulkOutOfCredits] = useState(false);

  // Blacklist check state
  const [blDomain, setBlDomain] = useState('');
  const [blLoading, setBlLoading] = useState(false);
  const [blResult, setBlResult] = useState<BlacklistResponse | null>(null);

  // Header tracer state
  const [rawHeaders, setRawHeaders] = useState('');
  const [hdrLoading, setHdrLoading] = useState(false);
  const [hdrResult, setHdrResult] = useState<HeaderTraceResponse | null>(null);

  const runBulkCheck = async () => {
    const domains = bulkDomains
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    if (!domains.length) return showToast('Enter at least one domain', 'error');

    setBulkLoading(true);
    setBulkOutOfCredits(false);
    try {
      const json = await authedFetch<BulkResponse>(`${API}/bulk-check`, {
        method: 'POST',
        body: JSON.stringify({ domains }),
      });
      setBulkResults(json.results);
    } catch (e) {
      if (e instanceof OutOfCreditsError) setBulkOutOfCredits(true);
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const runBlacklistCheck = async () => {
    if (!blDomain.trim()) return showToast('Enter a domain', 'error');
    setBlLoading(true);
    try {
      const json = await authedFetch<BlacklistResponse>(`${API}/blacklist`, {
        method: 'POST',
        body: JSON.stringify({ domain: blDomain.trim() }),
      });
      setBlResult(json);
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setBlLoading(false);
    }
  };

  const runHeaderTrace = async () => {
    if (!rawHeaders.trim()) return showToast('Paste header text first', 'error');
    setHdrLoading(true);
    try {
      const json = await authedFetch<HeaderTraceResponse>(`${API}/parse-headers`, {
        method: 'POST',
        body: JSON.stringify({ raw_headers: rawHeaders }),
      });
      setHdrResult(json);
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setHdrLoading(false);
    }
  };

  const handleUpgrade = () => {
    window.open('mailto:yogeshjathalkar@gmail.com?subject=Raptor Pro Upgrade', '_blank');
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-tabs">
        <div className={`arsenal-tab${tab === 'bulk' ? ' active' : ''}`} onClick={() => setTab('bulk')}>
          Check Domains
        </div>
        <div className={`arsenal-tab${tab === 'blacklist' ? ' active' : ''}`} onClick={() => setTab('blacklist')}>
          Spam Blocklists
        </div>
        <div className={`arsenal-tab${tab === 'headers' ? ' active' : ''}`} onClick={() => setTab('headers')}>
          Trace a Bounced Email
        </div>
      </div>

      {/* ── BULK CHECK ── */}
      {tab === 'bulk' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Input</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field">
                <label className="arsenal-label">Domains to check (one per line)</label>
                <textarea
                  className="arsenal-textarea"
                  value={bulkDomains}
                  onChange={(e) => setBulkDomains(e.target.value)}
                  placeholder={'acme.com\nwidgets.io\nprospect-corp.net'}
                />
                <div className="arsenal-hint">Up to 200 at a time · 1 credit per domain · a domain that can’t be checked is free</div>
              </div>
              <button className="arsenal-btn" disabled={bulkLoading} onClick={runBulkCheck}>
                {bulkLoading ? (<><span className="arsenal-spinner" /> Checking…</>) : 'Check my domains →'}
              </button>
              {bulkOutOfCredits && (
                <div className="arsenal-upgrade-wall visible">
                  <h4>Out of Credits</h4>
                  <p>You've used all your Raptor credits this cycle.</p>
                  <button className="arsenal-btn arsenal-btn-secondary" onClick={handleUpgrade}>Upgrade to Pro</button>
                </div>
              )}
            </div>
          </div>
          <div className="arsenal-card">
            <div className="arsenal-card-header">
              <span className="arsenal-card-title">Results</span>
              {bulkResults && (
                <span className="arsenal-card-sub">{bulkResults.length} domain{bulkResults.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="arsenal-card-body">
              {!bulkResults ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">Run a check to see how each domain is set up.</div>
                </div>
              ) : (
                <table className="arsenal-table">
                  <thead>
                    <tr><th>Domain</th><th title="Where its email is delivered">Mail server</th><th title="Says which servers may send email for this domain">Sender proof (SPF)</th><th title="Tells inboxes what to do with fake email from this domain">Anti-fake rule (DMARC)</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r) => (
                      <Fragment key={r.domain}>
                        <tr>
                          <td style={{ color: 'var(--white)' }}>{r.domain}</td>
                          <td>{r.mx.length ? r.mx[0] + (r.mx.length > 1 ? ` +${r.mx.length - 1}` : '') : '—'}</td>
                          <td>{r.spf ? '✓' : '✗'}</td>
                          <td>{r.dmarc ? '✓' : '✗'}</td>
                          <td>
                            <span className={`arsenal-badge ${r.verdict === 'healthy' ? 'ok' : r.verdict === 'warn' ? 'warn' : 'fail'}`}>
                              <span className="dot" />{r.verdict === 'healthy' ? 'Looks good' : r.verdict === 'warn' ? 'Needs attention' : 'Problem'}
                            </span>
                          </td>
                        </tr>
                        {r.reasons.length > 0 && (
                          <tr key={r.domain + '-reasons'}>
                            <td colSpan={5} style={{ fontSize: '0.6rem', color: 'var(--dim2)', paddingTop: 0 }}>
                              {r.reasons.join(' · ')}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BLACKLIST CHECK ── */}
      {tab === 'blacklist' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Input</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field">
                <label className="arsenal-label">Domain</label>
                <input className="arsenal-input" value={blDomain} onChange={(e) => setBlDomain(e.target.value)} placeholder="acme.com" />
                <div className="arsenal-hint">Looks up the domain’s mail server and checks it against 5 well-known spam blocklists · 1 credit</div>
              </div>
              <button className="arsenal-btn" disabled={blLoading} onClick={runBlacklistCheck}>
                {blLoading ? (<><span className="arsenal-spinner" /> Checking blocklists…</>) : 'Check blocklists →'}
              </button>
            </div>
          </div>
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Results</span></div>
            <div className="arsenal-card-body">
              {!blResult ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">No check run yet.</div>
                </div>
              ) : blResult.error ? (
                <div className="arsenal-empty"><div className="arsenal-empty-text">{blResult.error}</div></div>
              ) : (
                <>
                  <div className="arsenal-stats" style={{ marginBottom: '1.2rem' }}>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">Mail server</div>
                      <div className="arsenal-stat-value" style={{ fontSize: '1rem' }}>{blResult.mx_host}</div>
                    </div>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">Its address</div>
                      <div className="arsenal-stat-value" style={{ fontSize: '1rem' }}>{blResult.ip}</div>
                    </div>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">On blocklists</div>
                      <div className="arsenal-stat-value accent">{blResult.listed_count}/{blResult.checks.length}</div>
                    </div>
                  </div>
                  <table className="arsenal-table">
                    <thead><tr><th>Blocklist</th><th>Status</th></tr></thead>
                    <tbody>
                      {blResult.checks.map((c) => (
                        <tr key={c.zone}>
                          <td style={{ color: 'var(--white)' }}>{c.zone}</td>
                          <td>
                            {c.listed === true ? (
                              <span className="arsenal-badge fail"><span className="dot" />Blocked</span>
                            ) : c.listed === false ? (
                              <span className="arsenal-badge ok"><span className="dot" />Clean</span>
                            ) : (
                              <span className="arsenal-badge pending"><span className="dot" />Couldn’t check</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER TRACER ── */}
      {tab === 'headers' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Paste the email’s details</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field">
                <textarea
                  className="arsenal-textarea"
                  style={{ minHeight: 220 }}
                  value={rawHeaders}
                  onChange={(e) => setRawHeaders(e.target.value)}
                  placeholder={'Received: from mail.prospect.com ...\nReceived: from mx1.shoonyaorigins.com ...'}
                />
                <div className="arsenal-hint">In your email app, open the bounced or delayed email and choose “Show original” / “View source”, then paste the top part here · 1 credit</div>
              </div>
              <button className="arsenal-btn" disabled={hdrLoading} onClick={runHeaderTrace}>
                {hdrLoading ? (<><span className="arsenal-spinner" /> Reading…</>) : 'Show me the route →'}
              </button>
            </div>
          </div>
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">The route your email took</span></div>
            <div className="arsenal-card-body">
              {!hdrResult ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">Paste an email’s details to see every server it passed through.</div>
                </div>
              ) : !hdrResult.hop_count ? (
                <div className="arsenal-empty"><div className="arsenal-empty-text">Couldn’t find any servers in that text. Make sure you pasted the full details from the top (the lines starting with “Received:”).</div></div>
              ) : (
                <>
                  <div className="arsenal-console">
                    {hdrResult.hops.map((h, i) => (
                      <div
                        key={i}
                        className={`arsenal-console-line ${hdrResult.likely_filter_index === i ? 'fail' : 'ok'}`}
                      >
                        <span className="ts">#{i + 1}</span>
                        <span className="msg">
                          {h.from_host || 'unknown'} → {h.by_host || 'unknown'} {h.ip ? `[${h.ip}]` : ''} {h.timestamp ? `· ${new Date(h.timestamp).toLocaleString()}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  {hdrResult.likely_filter_hop && (
                    <div className="arsenal-badge fail" style={{ marginTop: '1rem' }}>
                      <span className="dot" />Longest wait: about {Math.round((hdrResult.likely_filter_hop.delay_seconds || 0) / 60)} min before reaching {hdrResult.likely_filter_hop.by_host || hdrResult.likely_filter_hop.from_host}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}