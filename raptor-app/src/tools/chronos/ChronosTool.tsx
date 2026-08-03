import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('chronos')!;
const API = toolApiBase('chronos');

interface ResolveResult {
  timezone: string;
  utc_offset_hours: number;
  resolved_name: string;
  local_send_time: string;
  send_after_utc: string;
  credits_left?: number;
}

interface ScheduledSend {
  place: string;
  timezone: string;
  local_send_time: string;
  send_after_utc: string;
}

export default function ChronosTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [place, setPlace] = useState('');
  const [localTime, setLocalTime] = useState('08:45');
  const [sendDate, setSendDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledSend[] | null>(null);

  const loadScheduled = async () => {
    try {
      const json = await authedFetch<{ scheduled: ScheduledSend[] }>(`${API}/scheduled`, {
        skipCreditsSync: true,
      });
      setScheduled(json.scheduled);
    } catch {
      // non-fatal — table just shows its own empty/error state
    }
  };

  useEffect(() => {
    loadScheduled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runResolve = async () => {
    if (!place.trim()) return showToast('Enter a location', 'error');
    setLoading(true);
    try {
      const json = await authedFetch<ResolveResult>(`${API}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ place, target_local_time: localTime, target_date: sendDate }),
      });
      setResult(json);
      loadScheduled();
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyUtc = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.send_after_utc);
    showToast('UTC timestamp copied', 'success');
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Schedule a Send</span></div>
          <div className="arsenal-card-body">
            <div className="arsenal-field">
              <label className="arsenal-label">Prospect Location</label>
              <input className="arsenal-input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Austin, Texas" />
            </div>
            <div className="arsenal-field-row">
              <div className="arsenal-field">
                <label className="arsenal-label">Local Send Time</label>
                <input className="arsenal-input" type="time" value={localTime} onChange={(e) => setLocalTime(e.target.value)} />
              </div>
              <div className="arsenal-field">
                <label className="arsenal-label">Date</label>
                <input className="arsenal-input" type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
              </div>
            </div>
            <button className="arsenal-btn" disabled={loading} onClick={runResolve}>
              {loading ? (<><span className="arsenal-spinner" /> Geocoding + resolving timezone…</>) : 'Resolve Send Time →'}
            </button>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
          <div className="arsenal-card-body">
            {!result ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Resolve a location to see the exact UTC send time.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats" style={{ marginBottom: '1.2rem' }}>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Timezone</div>
                    <div className="arsenal-stat-value accent" style={{ fontSize: '1.2rem' }}>{result.timezone}</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">UTC Offset</div>
                    <div className="arsenal-stat-value">{result.utc_offset_hours >= 0 ? '+' : ''}{result.utc_offset_hours}h</div>
                  </div>
                </div>
                <div className="arsenal-field">
                  <label className="arsenal-label">Resolved Location</label>
                  <div className="arsenal-code-block" style={{ color: 'var(--white)' }}>{result.resolved_name}</div>
                </div>
                <div className="arsenal-field">
                  <label className="arsenal-label">Local Send Time</label>
                  <div className="arsenal-code-block" style={{ color: 'var(--white)' }}>{result.local_send_time}</div>
                </div>
                <div className="arsenal-field">
                  <label className="arsenal-label">Schedule In Your Queue As (UTC)</label>
                  <div className="arsenal-code-block">
                    <span>{result.send_after_utc}</span>
                    <button className="arsenal-copy-btn" onClick={copyUtc}>Copy</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Upcoming Scheduled Sends</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<ScheduledSend>
            rows={scheduled}
            keyField={(s) => s.send_after_utc + s.place}
            emptyText="No sends scheduled yet."
            columns={[
              { header: 'Place', render: (s) => <span style={{ color: 'var(--white)' }}>{s.place}</span> },
              { header: 'Timezone', render: (s) => s.timezone },
              { header: 'Local Time', render: (s) => new Date(s.local_send_time).toLocaleString('en-IN') },
              { header: 'Send After (UTC)', render: (s) => new Date(s.send_after_utc).toISOString() },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
