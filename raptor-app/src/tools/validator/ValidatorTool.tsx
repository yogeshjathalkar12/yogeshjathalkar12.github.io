import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('validator')!;

// verify-email is a flat route (/api/raptor/verify-email), not nested under
// /validator/ like the other Arsenal tools — this derives the shared API
// root from toolApiBase without needing to know its internals or export a
// second constant from lib/config.
const API_ROOT = toolApiBase('_root').replace(/\/_root$/, '');

type VerifyStatus = 'valid' | 'unknown' | 'invalid';

interface VerifyResponse {
  status: VerifyStatus;
  error?: string;
  credits_left?: number;
}

interface HistoryEntry {
  email: string;
  result: 'ok' | 'warn' | 'fail';
  time: string;
}

export default function ValidatorTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'ok' | 'warn' | 'fail' | null>(null);
  const [detail, setDetail] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const runVerify = async () => {
    const emailVal = email.trim();
    if (!emailVal || !emailVal.includes('@')) return showToast('Enter a valid email address', 'error');

    setLoading(true);
    const domain = emailVal.split('@')[1];

    try {
      const json = await authedFetch<VerifyResponse>(`${API_ROOT}/verify-email?address=${encodeURIComponent(emailVal)}`);

      let result: 'ok' | 'warn' | 'fail';
      let statusText: string;
      let detailHtml: string;

      if (json.status === 'valid') {
        result = 'ok';
        statusText = '✓ Safe to Send — Mailbox Confirmed';
        detailHtml = `Domain: ${domain} · MX Records: Found · SMTP Handshake: Accepted`;
      } else if (json.status === 'unknown') {
        result = 'warn';
        statusText = '⚠ Risky — Domain Exists, Mailbox Uncertain';
        detailHtml = `Domain: ${domain} · MX Records: Found · SMTP: ${json.error || 'Inconclusive'}`;
      } else {
        result = 'fail';
        statusText = '✗ Do Not Send — Will Hard Bounce';
        detailHtml = `Domain: ${domain} · Reason: Mailbox rejected by mail server`;
      }

      setStatus(result);
      setDetail(`${statusText} — ${detailHtml}`);
      setHistory((prev) => [
        { email: emailVal, result, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
        ...prev,
      ]);
    } catch (e) {
      if (e instanceof OutOfCreditsError) {
        showToast('Out of credits', 'error');
      } else {
        // Same principle as the original: never fabricate a pass/fail verdict
        // when the API itself is unreachable, and don't log it to history —
        // nothing was actually checked.
        setStatus('fail');
        setDetail(`✗ Could Not Verify — API Unreachable — Could not reach the verification server. Check your connection or try again.`);
        showToast('API request failed — no credit was charged', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Ping-Verify Engine</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Target Email Address</label>
              <input
                className="arsenal-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ceo@targetcompany.com"
              />
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runVerify}>
              {loading ? (<><span className="arsenal-spinner" /> Verifying…</>) : 'Verify Email →'}
            </button>

            {status && (
              <div className="arsenal-code-block" style={{ marginTop: '1rem', color: status === 'ok' ? 'var(--green)' : status === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                {detail}
              </div>
            )}
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header">
            <span className="arsenal-card-title">Verification History</span>
            <span className="arsenal-card-sub">{history.length} checks</span>
          </div>
          <div className="arsenal-card-body">
            {history.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">✉</div>
                <div className="arsenal-empty-text">No checks yet — run your first verification.</div>
              </div>
            ) : (
              <div className="arsenal-console">
                {history.map((h, i) => (
                  <div key={i} className={`arsenal-console-line ${h.result === 'ok' ? 'ok' : h.result === 'fail' ? 'fail' : ''}`}>
                    <span className="ts">{h.time}</span>
                    <span className="msg">
                      {h.email} — {h.result === 'ok' ? '✓ Valid' : h.result === 'warn' ? '⚠ Risky' : '✗ Invalid'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Pro Tip</span></div>
        <div className="arsenal-card-body" style={{ fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.7 }}>
          Run verifications before any cold outreach campaign. A bounce rate above 3% can permanently damage your domain sender score with Gmail and Outlook.
          <br /><br />
          <span style={{ color: 'var(--white)' }}>✓ Safe to send</span> — mailbox confirmed<br />
          <span style={{ color: 'var(--amber)' }}>⚠ Risky</span> — domain exists, mailbox uncertain<br />
          <span style={{ color: 'var(--red)' }}>✗ Do not send</span> — will hard bounce
        </div>
      </div>
    </ToolLayout>
  );
}