import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('spintax')!;
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
    if (!template.trim()) return showToast('Write your email first', 'error');
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
    if (!campaign) return showToast('Enter the campaign name', 'error');
    setQueueLoading2(true);
    try {
      const json = await authedFetch<{ queue: QueueItem[] }>(`${API}/queue/${encodeURIComponent(campaign)}`, {
        skipCreditsSync: true,
      });
      setQueue(json.queue || []);
    } catch {
      showToast('Could not load the saved versions', 'error');
    } finally {
      setQueueLoading2(false);
    }
  };

  const runQueue = async () => {
    if (!template.trim() || !campaignId.trim()) return showToast('Write your email and give the campaign a name', 'error');
    setQueueLoading(true);
    try {
      const json = await authedFetch<QueueResponse>(`${API}/queue`, {
        method: 'POST',
        body: JSON.stringify({ template, campaign_id: campaignId.trim() }),
      });
      showToast(`Saved ${json.unique_variants_queued} different versions to "${json.campaign_id}"`, 'success');
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
          <div className="arsenal-card-header"><span className="arsenal-card-title">Your email</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Write your email with choices</label>
              <textarea
                className="arsenal-textarea"
                style={{ minHeight: 150 }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="{Hi|Hello|Hey} there, our tool boosts {margins|ROI|close rates} for teams like yours."
              />
              <div className="arsenal-hint">Put alternatives in curly braces separated by | — for example {'{Hi|Hello|Hey}'}. Each combination becomes a different version. Previewing is free; saving costs 1 credit for each different version. This page creates and saves the versions — it doesn’t send emails.</div>
            </div>
            <div className="arsenal-field">
              <label className="arsenal-label">Campaign name</label>
              <input className="arsenal-input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="acme-outreach-9x2" />
            </div>
            <button className="arsenal-btn arsenal-btn-secondary" style={{ marginBottom: '0.8rem' }} disabled={previewLoading} onClick={runPreview}>
              {previewLoading ? (<><span className="arsenal-spinner" /> Working…</>) : 'Preview the versions (free) →'}
            </button>
            <button className="arsenal-btn" disabled={queueLoading} onClick={runQueue}>
              {queueLoading ? (<><span className="arsenal-spinner" /> Saving…</>) : 'Save the versions →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header">
            <span className="arsenal-card-title">Your versions</span>
            {compileResult && <span className="arsenal-card-sub">{compileResult.variant_count} combinations</span>}
          </div>
          <div className="arsenal-card-body">
            {!compileResult ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Preview your email to see the different versions.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats" style={{ marginBottom: '1rem' }}>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Combinations</div>
                    <div className="arsenal-stat-value accent">{compileResult.variant_count}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Credits to save them all (at most)</div>
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
        <div className="arsenal-card-header"><span className="arsenal-card-title">Saved versions</span></div>
        <div className="arsenal-card-body">
          <div className="arsenal-field-row" style={{ alignItems: 'flex-end' }}>
            <div className="arsenal-field">
              <label className="arsenal-label">Campaign name</label>
              <input className="arsenal-input" value={lookupCampaignId} onChange={(e) => setLookupCampaignId(e.target.value)} placeholder="acme-outreach-9x2" />
            </div>
            <button
              className="arsenal-btn arsenal-btn-secondary"
              style={{ width: 'auto', padding: '0.75rem 1.4rem' }}
              disabled={queueLoading2}
              onClick={() => loadQueue()}
            >
              Show saved versions
            </button>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {queue && (
              queue.length === 0 ? (
                <div className="arsenal-empty"><div className="arsenal-empty-text">Nothing saved under that campaign name.</div></div>
              ) : (
                <table className="arsenal-table">
                  <thead><tr><th>Version</th><th>Status</th></tr></thead>
                  <tbody>
                    {queue.map((q, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--white)' }}>{q.variant_text}</td>
                        <td>
                          {q.sent ? (
                            <span className="arsenal-badge ok"><span className="dot" />Sent</span>
                          ) : (
                            <span className="arsenal-badge pending"><span className="dot" />Not sent yet</span>
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