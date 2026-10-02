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
    if (!nameRaw) return showToast('Give this email a name first', 'error');

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
      showToast('Done — now paste the code into your email.', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else showToast('Couldn’t create the tracking code. Please try again in a moment.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyHtml = (html: string) => {
    navigator.clipboard.writeText(html);
    showToast('Copied', 'success');
  };

  // 30s poll, matching the original's pollCampaignOpens — opens are read
  // through the backend, never queried from Supabase directly client-side,
  // since raptor_opens has no per-user RLS scoping.
  // On arrival, bring back every email that has already been opened (this
  // page used to forget everything on refresh). The name is recovered from the
  // id (a name plus a short random suffix).
  useEffect(() => {
    authedFetch<CampaignOpensResponse>(`${API_ROOT}/campaign-opens`, { skipCreditsSync: true })
      .then((json) => {
        const restored: Campaign[] = (json.campaigns || []).map((s) => {
          const pixelUrl = `${API_ROOT}/track/${s.campaign_id}.png`;
          return {
            id: s.campaign_id,
            name: s.campaign_id.replace(/-[a-z0-9]{1,8}$/i, '').replace(/-/g, ' ') || s.campaign_id,
            opens: s.opens,
            lastOpen: s.last_open,
            pixelUrl,
            pixelHtml: `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`,
          };
        });
        setCampaigns((prev) => [...prev, ...restored.filter((r) => !prev.some((p) => p.id === r.id))]);
      })
      .catch(() => { /* nothing to restore, or offline - the list simply starts empty */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            showToast(`📬 Opened — ${c.name}`, 'success');
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
          <div className="arsenal-card-header"><span className="arsenal-card-title">Track an email</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Name this email</label>
              <input
                className="arsenal-input"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Pitch to Acme’s CEO"
              />
            </div>
            <button className="arsenal-btn" disabled={generating} onClick={generatePixel}>
              {generating ? (<><span className="arsenal-spinner" /> Creating…</>) : 'Create tracking code →'}
            </button>

            {lastResult && (
              <div style={{ marginTop: '1rem' }}>
                <div className="arsenal-field">
                  <label className="arsenal-label">Tracking image address</label>
                  <div className="arsenal-code-block" style={{ color: 'var(--purple)' }}>{lastResult.pixelUrl}</div>
                </div>
                <div className="arsenal-field">
                  <label className="arsenal-label">Code to paste into your email (HTML view or signature)</label>
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
            <span className="arsenal-card-title">Who opened what</span>
            <span className="arsenal-card-sub">● Updates every 30 seconds</span>
          </div>
          <div className="arsenal-card-body">
            {campaigns.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◎</div>
                <div className="arsenal-empty-text">Nothing tracked yet — create a tracking code and paste it into an email. Tip: opens in the first few seconds are ignored (email apps preview messages before anyone reads them), and some inboxes hide opens.</div>
              </div>
            ) : (
              <table className="arsenal-table">
                <thead>
                  <tr><th>Email</th><th>Status</th><th>Last opened</th><th>Times opened</th><th>Code</th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--white)' }}>{c.name}</td>
                      <td>
                        {c.opens > 0
                          ? <span className="arsenal-badge ok"><span className="dot" />Opened</span>
                          : <span className="arsenal-badge pending"><span className="dot" />Not opened yet</span>}
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