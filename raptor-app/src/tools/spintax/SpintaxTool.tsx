import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('spintax')!;
// NOTE: spintax.html hit `${RAPTOR_API_URL}/api/spintax` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/spintax` —
// confirm that's actually where the backend route lives.
const API = toolApiBase('spintax');

interface CompileResponse {
  variant_count: number;
  sample: string[];
}

interface QueueResponse {
  campaign_id: string;
  unique_variants_queued: number;
  credits_left?: number;
}

interface QueueItem {
  variant_text: string;
  sent: boolean;
}

export default function SpintaxTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [template, setTemplate] = useState(
    '{Hi|Hello|Hey} there, our tool boosts {margins|ROI|{close rates|conversion}} for teams like yours.',
  );
  const [campaignId, setCampaignId] = useState('');
  const [lookupCampaignId, setLookupCampaignId] = useState('');

  const [previewLoading, setPreviewLoading] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null);

  const [queueLoading, setQueueLoading] = useState(false);

  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueLoading2, setQueueLoading2] = useState(false);

  const runPreview = async () => {
    if (!template.trim()) return showToast('Enter a template', 'error');
    setPreviewLoading(true);
    try {
      const json = await authedFetch<CompileResponse>(`${API}/compile`, {
        method: 'POST',
        body: JSON.stringify({ template }),
        skipCreditsSync: true,
      });
      setCompileResult(json);
    } catch (e) {
      if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadQueue = async (id?: string) => {
    const campaign = (id ?? lookupCampaignId).trim();
    if (!campaign) return showToast('Enter a campaign ID', 'error');
    setQueueLoading2(true);
    try {
      const json = await authedFetch<{ queue: QueueItem[] }>(`${API}/queue/${encodeURIComponent(campaign)}`, {
        skipCreditsSync: true,
      });
      setQueue(json.queue || []);
    } catch {
      showToast('Could not load queue', 'error');
    } finally {
      setQueueLoading2(false);
    }
  };

  const runQueue = async () => {
    if (!template.trim() || !campaignId.trim()) return showToast('Template and Campaign ID are required', 'error');
    setQueueLoading(true);
    try {
      const json = await authedFetch<QueueResponse>(`${API}/queue`, {
        method: 'POST',
        body: JSON.stringify({ template, campaign_id: campaignId.trim() }),
      });
      showToast(`Queued ${json.unique_variants_queued} variants for "${json.campaign_id}"`, 'success');
      setLookupCampaignId(json.campaign_id);
      loadQueue(json.campaign_id);
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Template</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Spintax Template</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 150 }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="{Hi|Hello|Hey} {name}, our tool boosts {margins|ROI|close rates} for teams like yours."
              />
              <div className="arsenal-hint">Nesting supported: {'{A|{B|C}}'}. Preview is free — queueing costs 1 credit per unique variant.</div>
            </div>
            <div className="arsenal-field">
              <label className="arsenal-label">Campaign ID</label>
              <input className="arsenal-input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="acme-outreach-9x2" />
            </div>
            <button className="arsenal-btn arsenal-btn-secondary" style={{ marginBottom: '0.8rem' }} disabled={previewLoading} onClick={runPreview}>
              {previewLoading ? (<><span className="arsenal-spinner" /> Compiling…</>) : 'Preview Permutations (Free) →'}
            </button>
            <button className="arsenal-btn" disabled={queueLoading} onClick={runQueue}>
              {queueLoading ? (<><span className="arsenal-spinner" /> Queueing…</>) : 'Compile & Queue →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header">
            <span className="arsenal-card-title">Output</span>
            {compileResult && <span className="arsenal-card-sub">{compileResult.variant_count} unique variants</span>}
          </div>
          <div className="arsenal-card-body">
            {!compileResult ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Preview your template to see generated variants.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats" style={{ marginBottom: '1rem' }}>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Total Permutations</div>
                    <div className="arsenal-stat-value accent">{compileResult.variant_count}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Credits to Queue All</div>
                    <div className="arsenal-stat-value">{compileResult.variant_count}</div>
                  </div>
                </div>
                <div className="arsenal-console">
                  {compileResult.sample.map((s, i) => (
                    <div key={i} className="arsenal-console-line ok">
                      <span className="ts">#{i + 1}</span>
                      <span className="msg">{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Queue Lookup</span></div>
        <div className="arsenal-card-body">
          <div className="arsenal-field-row" style={{ alignItems: 'flex-end' }}>
            <div className="arsenal-field">
              <label className="arsenal-label">Campaign ID</label>
              <input className="arsenal-input" value={lookupCampaignId} onChange={(e) => setLookupCampaignId(e.target.value)} placeholder="acme-outreach-9x2" />
            </div>
            <button
              className="arsenal-btn arsenal-btn-secondary"
              style={{ width: 'auto', padding: '0.75rem 1.4rem' }}
              disabled={queueLoading2}
              onClick={() => loadQueue()}
            >
              Load Queue
            </button>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {queue && (
              queue.length === 0 ? (
                <div className="arsenal-empty"><div className="arsenal-empty-text">No queued variants for this campaign.</div></div>
              ) : (
                <table className="arsenal-table">
                  <thead><tr><th>Variant</th><th>Status</th></tr></thead>
                  <tbody>
                    {queue.map((q, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--white)' }}>{q.variant_text}</td>
                        <td>
                          {q.sent ? (
                            <span className="arsenal-badge ok"><span className="dot" />Sent</span>
                          ) : (
                            <span className="arsenal-badge pending"><span className="dot" />Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}