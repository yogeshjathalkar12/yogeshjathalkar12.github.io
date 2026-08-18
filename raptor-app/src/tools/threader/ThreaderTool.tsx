import { useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('threader')!;
// NOTE: threader.html hit `${RAPTOR_API_URL}/api/threader` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/threader` —
// confirm that's actually where the backend route lives.
const API = toolApiBase('threader');

type Tab = 'scan' | 'history';

interface ThreadNode {
  subject?: string;
  from?: string;
  date?: string;
  is_bot?: boolean;
  parent_id?: string | null;
  children?: string[];
}

interface ScanResponse {
  scanned: number;
  human_replies: number;
  bot_replies: number;
  roots: string[];
  nodes: Record<string, ThreadNode>;
  credits_left?: number;
}

interface ScanHistoryEntry {
  mailbox: string;
  message_count: number;
  human_reply_count: number;
  created_at: string;
}

function TreeNode({ node, nodes, depth = 0 }: { node: ThreadNode; nodes: Record<string, ThreadNode>; depth?: number }) {
  return (
    <>
      <div
        style={{
          paddingLeft: `${depth * 1.4}rem`,
          paddingBottom: '0.8rem',
          borderLeft: depth > 0 ? '1px solid var(--border)' : 'none',
          marginLeft: depth > 0 ? '0.4rem' : '0',
        }}
      >
        <div style={{ fontSize: '0.68rem', color: 'var(--white)' }}>
          {node.subject || '(no subject)'}
          {node.is_bot ? (
            <span className="arsenal-badge fail" style={{ marginLeft: '0.6rem' }}><span className="dot" />Bot</span>
          ) : node.parent_id ? (
            <span className="arsenal-badge ok" style={{ marginLeft: '0.6rem' }}><span className="dot" />Human Reply</span>
          ) : null}
        </div>
        <div style={{ fontSize: '0.58rem', color: 'var(--dim2)' }}>
          {node.from || ''} {node.date ? `· ${new Date(node.date).toLocaleString('en-IN')}` : ''}
        </div>
      </div>
      {(node.children || []).map((childId) => {
        const child = nodes[childId];
        return child ? <TreeNode key={childId} node={child} nodes={nodes} depth={depth + 1} /> : null;
      })}
    </>
  );
}

export default function ThreaderTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('scan');

  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapUser, setImapUser] = useState('');
  const [imapPass, setImapPass] = useState('');
  const [imapMailbox, setImapMailbox] = useState('INBOX');
  const [imapLimit, setImapLimit] = useState(200);

  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);

  const [history, setHistory] = useState<ScanHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const runScan = async () => {
    if (!imapHost.trim() || !imapUser.trim() || !imapPass) {
      return showToast('Host, username, and app password are required', 'error');
    }
    setScanLoading(true);
    try {
      const json = await authedFetch<ScanResponse>(`${API}/scan-threads`, {
        method: 'POST',
        body: JSON.stringify({
          imap_host: imapHost.trim(),
          imap_port: imapPort || 993,
          username: imapUser.trim(),
          app_password: imapPass,
          mailbox: imapMailbox.trim() || 'INBOX',
          limit: imapLimit || 200,
        }),
      });
      setScanResult(json);
      showToast('Mailbox scanned successfully', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setScanLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const json = await authedFetch<{ scans: ScanHistoryEntry[] }>(`${API}/history`, { skipCreditsSync: true });
      setHistory(json.scans || []);
    } catch {
      showToast('Could not load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'history' && history === null) loadHistory();
  };

  const rootNodes = scanResult ? scanResult.roots.map((id) => scanResult.nodes[id]).filter(Boolean) : [];

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-tabs">
        <div className={`arsenal-tab${tab === 'scan' ? ' active' : ''}`} onClick={() => switchTab('scan')}>Scan Mailbox</div>
        <div className={`arsenal-tab${tab === 'history' ? ' active' : ''}`} onClick={() => switchTab('history')}>Scan History</div>
      </div>

      {tab === 'scan' && (
        <div className="arsenal-grid">
          <div className="arsenal-card">
            <div className="arsenal-card-header"><span className="arsenal-card-title">Mailbox Connection</span></div>
            <div className="arsenal-card-body">
              <div className="arsenal-field-row">
                <div className="arsenal-field">
                  <label className="arsenal-label">IMAP Host</label>
                  <input className="arsenal-input" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.gmail.com" />
                </div>
                <div className="arsenal-field" style={{ maxWidth: 110 }}>
                  <label className="arsenal-label">Port</label>
                  <input className="arsenal-input" value={imapPort} onChange={(e) => setImapPort(parseInt(e.target.value) || 993)} />
                </div>
              </div>
              <div className="arsenal-field">
                <label className="arsenal-label">Username</label>
                <input className="arsenal-input" value={imapUser} onChange={(e) => setImapUser(e.target.value)} placeholder="hello@shoonyaorigins.com" />
              </div>
              <div className="arsenal-field">
                <label className="arsenal-label">App Password</label>
                <input className="arsenal-input" type="password" value={imapPass} onChange={(e) => setImapPass(e.target.value)} placeholder="••••••••••••••••" />
                <div className="arsenal-hint">Never stored — used once to open the connection, then discarded. Use an app-specific password, not your real login.</div>
              </div>
              <div className="arsenal-field-row">
                <div className="arsenal-field">
                  <label className="arsenal-label">Mailbox</label>
                  <input className="arsenal-input" value={imapMailbox} onChange={(e) => setImapMailbox(e.target.value)} />
                </div>
                <div className="arsenal-field" style={{ maxWidth: 110 }}>
                  <label className="arsenal-label">Limit</label>
                  <input className="arsenal-input" value={imapLimit} onChange={(e) => setImapLimit(parseInt(e.target.value) || 200)} />
                </div>
              </div>
              <button className="arsenal-btn" disabled={scanLoading} onClick={runScan}>
                {scanLoading ? (<><span className="arsenal-spinner" /> Connecting to mailbox…</>) : 'Scan Threads →'}
              </button>
            </div>
          </div>

          <div className="arsenal-card">
            <div className="arsenal-card-header">
              <span className="arsenal-card-title">Reply Tree</span>
              {scanResult && <span className="arsenal-card-sub">{scanResult.scanned} messages</span>}
            </div>
            <div className="arsenal-card-body">
              {!scanResult ? (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-icon">◌</div>
                  <div className="arsenal-empty-text">Connect a mailbox to build the reply tree.</div>
                </div>
              ) : (
                <>
                  <div className="arsenal-stats" style={{ marginBottom: '1.2rem' }}>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">Human Replies</div>
                      <div className="arsenal-stat-value accent">{scanResult.human_replies}</div>
                    </div>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">Bot Replies Filtered</div>
                      <div className="arsenal-stat-value">{scanResult.bot_replies}</div>
                    </div>
                    <div className="arsenal-stat">
                      <div className="arsenal-stat-label">Threads</div>
                      <div className="arsenal-stat-value">{scanResult.roots.length}</div>
                    </div>
                  </div>
                  <div className="arsenal-console" style={{ maxHeight: 420 }}>
                    {rootNodes.length === 0 ? (
                      <div className="arsenal-console-empty">No threads found.</div>
                    ) : (
                      rootNodes.map((n, i) => <TreeNode key={i} node={n} nodes={scanResult.nodes} />)
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Past Scans</span></div>
          <div className="arsenal-card-body">
            {historyLoading ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">Loading…</div></div>
            ) : !history || history.length === 0 ? (
              <div className="arsenal-empty"><div className="arsenal-empty-text">No scans yet.</div></div>
            ) : (
              <table className="arsenal-table">
                <thead><tr><th>Mailbox</th><th>Messages</th><th>Human Replies</th><th>Date</th></tr></thead>
                <tbody>
                  {history.map((s, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--white)' }}>{s.mailbox}</td>
                      <td>{s.message_count}</td>
                      <td>{s.human_reply_count}</td>
                      <td>{new Date(s.created_at).toLocaleString('en-IN')}</td>
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