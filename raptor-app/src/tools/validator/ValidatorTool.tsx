import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { ApiError, OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('validator')!;

// verify-email is a flat route (/api/raptor/verify-email), not nested under
// /validator/ like the other Arsenal tools — this derives the shared API
// root from toolApiBase without needing to know its internals or export a
// second constant from lib/config.
const API_ROOT = toolApiBase('_root').replace(/\/_root$/, '');

// 'risky' = the mail server didn't give a clear yes or no (very common - many
// servers refuse or ignore this kind of check). It must never be shown as a
// confirmed bad address.
type VerifyStatus = 'valid' | 'risky' | 'unknown' | 'invalid';

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
    if (!emailVal || !emailVal.includes('@')) return showToast('Enter an email address like name@company.com', 'error');

    setLoading(true);
    const domain = emailVal.split('@')[1];

    try {
      const json = await authedFetch<VerifyResponse>(`${API_ROOT}/verify-email?address=${encodeURIComponent(emailVal)}`);

      let result: 'ok' | 'warn' | 'fail';
      let statusText: string;
      let detailHtml: string;

      if (json.status === 'valid') {
        result = 'ok';
        statusText = '✓ Looks real';
        detailHtml = `${domain} accepts email and confirmed this address exists.`;
      } else if (json.status === 'risky' || json.status === 'unknown') {
        result = 'warn';
        statusText = '⚠ Couldn’t be sure';
        detailHtml = `${domain} accepts email, but its server wouldn’t confirm this address. That’s common and doesn’t mean it’s wrong — send with care, and keep an eye on bounces.`;
      } else {
        result = 'fail';
        statusText = '✗ Don’t send';
        detailHtml = `${domain} said this address doesn’t exist (or the domain can’t receive email). Sending would bounce.`;
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
        // Never fabricate a verdict when the check itself didn't work, and
        // don't log it to history - nothing was actually checked. Say what
        // really happened (a rejected request is not the same as being offline).
        setStatus('warn');
        const reason = e instanceof ApiError && e.status !== 0 ? e.message : 'We couldn’t reach the checking service. Check your connection and try again.';
        setDetail(`⚠ Couldn’t check this address — ${reason}`);
        showToast('The check didn’t complete', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Check an email address</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Email address</label>
              <input
                className="arsenal-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ceo@targetcompany.com"
              />
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runVerify}>
              {loading ? (<><span className="arsenal-spinner" /> Checking…</>) : 'Check it →'}
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
            <span className="arsenal-card-title">Addresses you’ve checked</span>
            <span className="arsenal-card-sub">{history.length} checks</span>
          </div>
          <div className="arsenal-card-body">
            {history.length === 0 ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">✉</div>
                <div className="arsenal-empty-text">Nothing checked yet.</div>
              </div>
            ) : (
              <div className="arsenal-console">
                {history.map((h, i) => (
                  <div key={i} className={`arsenal-console-line ${h.result === 'ok' ? 'ok' : h.result === 'fail' ? 'fail' : ''}`}>
                    <span className="ts">{h.time}</span>
                    <span className="msg">
                      {h.email} — {h.result === 'ok' ? '✓ Looks real' : h.result === 'warn' ? '⚠ Not sure' : '✗ Don’t send'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Why check first?</span></div>
        <div className="arsenal-card-body" style={{ fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.7 }}>
          Check addresses before you email a new list. If more than about 3 in 100 emails bounce, Gmail and Outlook start treating your emails as spam.
          <br /><br />
          <span style={{ color: 'var(--white)' }}>✓ Looks real</span> — the address was confirmed<br />
          <span style={{ color: 'var(--amber)' }}>⚠ Not sure</span> — the company accepts email but wouldn’t confirm this address<br />
          <span style={{ color: 'var(--red)' }}>✗ Don’t send</span> — it will bounce
        </div>
      </div>
    </ToolLayout>
  );
}