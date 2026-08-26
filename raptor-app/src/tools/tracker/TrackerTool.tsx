import { useEffect, useRef, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('tracker')!;

// Same flat-route situation as the validator — generate-tracker, track/:id.png,
// and campaign-opens all live directly under /api/raptor/, not /tracker/.
const API_ROOT = toolApiBase('_root').replace(/\/_root$/, '');

interface GenerateTrackerResponse {
  campaign_id: string;
  html_tag: string;
  credits_left?: number;
}

interface CampaignOpensResponse {
  campaigns: { campaign_id: string; opens: number; last_open: string | null }[];
}

interface Campaign {
  id: string;
  name: string;
  opens: number;
  lastOpen: string | null;
  pixelUrl: string;
  pixelHtml: string;
}

export default function TrackerTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [campaignName, setCampaignName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lastResult, setLastResult] = useState<Campaign | null>(null);
  const campaignsRef = useRef<Campaign[]>([]);
  campaignsRef.current = campaigns;

  const generatePixel = async () => {
    const nameRaw = campaignName.trim();
    if (!nameRaw) return showToast('Enter a campaign name', 'error');

    setGenerating(true);
    try {
      // Same sanitization as the original: match the backend's
      // is_valid_campaign_id (letters, numbers, - and _ only), then add a
      // random suffix so the public /track/{id}.png endpoint can't be
      // guessed or used to spam fake opens.
      const slug = nameRaw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const randomSuffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
      const campaignIdCandidate = `${slug}-${randomSuffix}`;

      const json = await authedFetch<GenerateTrackerResponse>(
        `${API_ROOT}/generate-tracker?campaign_id=${encodeURIComponent(campaignIdCandidate)}&display_name=${encodeURIComponent(nameRaw)}`,
      );

      const pixelUrl = `${API_ROOT}/track/${json.campaign_id}.png`;
      const campaign: Campaign = { id: json.campaign_id, name: nameRaw, opens: 0, lastOpen: null, pixelUrl, pixelHtml: json.html_tag };

      setCampaigns((prev) => [campaign, ...prev]);
      setLastResult(campaign);
      setCampaignName('');
      showToast('Pixel generated! Embed in your email.', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else showToast('API not connected — could not generate a real pixel', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyHtml = (html: string) => {
    navigator.clipboard.writeText(html);
    showToast('HTML tag copied', 'success');
  };

  // 30s poll, matching the original's pollCampaignOpens — opens are read
  // through the backend, never queried from Supabase directly client-side,
  // since raptor_opens has no per-user RLS scoping.
  useEffect(() => {
    const poll = async () => {
      if (!campaignsRef.current.length) return;
      try {
        const json = await authedFetch<CampaignOpensResponse>(`${API_ROOT}/campaign-opens`, { skipCreditsSync: true });
        const serverCampaigns = json.campaigns || [];

        setCampaigns((prev) =>
          prev.map((c) => {
            const match = serverCampaigns.find((s) => s.campaign_id === c.id);
            if (!match || match.opens <= c.opens) return c;
            showToast(`📬 Email opened — ${c.name}`, 'success');
            return { ...c, opens: match.opens, lastOpen: match.last_open };
          }),
        );
      } catch {
        // Unreachable this cycle — skip silently, try again next interval.
      }
    };

    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Pixel Generator</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Campaign / Prospect Name</label>
              <input
                className="arsenal-input"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. pitch-acmecorp-ceo"
              />
            </div>
            <button className="arsenal-btn" disabled={generating} onClick={generatePixel}>
              {generating ? (<><span className="arsenal-spinner" /> Generating…</>) : 'Generate Pixel →'}
            </button>

            {lastResult && (
              <div style={{ marginTop: '1rem' }}>
                <div className="arsenal-field">
                  <label className="arsenal-label">Pixel URL</label>
                  <div className="arsenal-code-block" style={{ color: 'var(--purple)' }}>{lastResult.pixelUrl}</div>
                </div>
                <div className="arsenal-field">
                  <label className="arsenal-label">HTML Tag (paste into email signature)</label>
                  <div className="arsenal-code-block" style={{ wordBreak: 'break-all' }}>
                    {lastResult.pixelHtml}
                    <button className="arsenal-copy-btn" onClick={() => copyHtml(lastResult.pixelHtml)}>Copy</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header">
            <span className="arsenal-card-title">Live Open Log</span>
            <span className="arsenal-card-sub">● Polling every 30s</span>
          </div>
          <div className="arsenal-card-body">
            {campaigns.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◎</div>
                <div className="arsenal-empty-text">No campaigns yet — generate your first pixel to start tracking.</div>
              </div>
            ) : (
              <table className="arsenal-table">
                <thead>
                  <tr><th>Campaign</th><th>Status</th><th>Last Open</th><th>Opens</th><th>Pixel</th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--white)' }}>{c.name}</td>
                      <td>
                        {c.opens > 0
                          ? <span className="arsenal-badge ok"><span className="dot" />Opened</span>
                          : <span className="arsenal-badge pending"><span className="dot" />Pending</span>}
                      </td>
                      <td>{c.lastOpen ? new Date(c.lastOpen).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'}</td>
                      <td>{c.opens}</td>
                      <td><button className="arsenal-copy-btn" onClick={() => copyHtml(c.pixelHtml)}>Copy</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}