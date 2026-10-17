import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { toolApiBase } from '../../lib/config';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { useOrg } from '../../hooks/OrgContext';
import { ApiError } from '../../lib/apiErrors';
import { fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../../components/crm/Modal';

const API = toolApiBase('connections');

interface ProviderField { name: string; label: string; placeholder: string; help: string; secret: boolean; required: boolean }
interface Provider {
  provider: string; title: string; description: string; category: string; available: boolean;
  auth: 'none' | 'oauth'; can_reply: boolean; fields: ProviderField[];
}
interface Connection {
  id: string; provider: string; label: string; external_id: string | null; status: 'pending' | 'connected' | 'error' | 'paused';
  last_sync_at: string | null; last_error: string | null; created_at: string;
}
interface Signal {
  name: string; value: number | null; text_value?: string | null; occurred_at: string;
  entity: { video_id?: string; title?: string; comment_id?: string; author?: string; author_channel?: string; replies?: number; parent_id?: string } | null;
}

const labelStyle = { display: 'block', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.3rem' } as const;
const noteStyle = { fontSize: '0.78rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const cardStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: '1.2rem', background: 'var(--surface)' } as const;
const STATUS: Record<string, { text: string; color: string }> = {
  connected: { text: 'Connected', color: 'var(--green, #3ecf8e)' },
  error: { text: 'Needs attention', color: 'var(--red, #ef5350)' },
  paused: { text: 'Paused', color: 'var(--dim)' },
  pending: { text: 'Setting up', color: 'var(--dim)' },
};
const METRIC_NAMES: Record<string, string> = {
  subscribers: 'Subscribers', views: 'Total views', videos: 'Videos',
  views_28d: 'Views, last 28 days', watch_minutes_28d: 'Minutes watched, last 28 days', subs_gained_28d: 'New subscribers, last 28 days',
};

const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n));
function ago(iso: string | null) {
  if (!iso) return 'not yet';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

export default function Connections() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const { can } = useOrg();
  const canManage = can('manage_automations');
  const [params, setParams] = useSearchParams();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [signals, setSignals] = useState<Record<string, Signal[]>>({});
  const [comments, setComments] = useState<Record<string, Signal[]>>({});
  const [repliedTo, setRepliedTo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Provider | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Read straight from the database: row-level security already limits this to the caller's own organization,
  // and the secrets table is not readable from the browser at all.
  const load = useCallback(async () => {
    const { data: rows, error: err } = await supabase
      .from('connections')
      .select('id, provider, label, external_id, status, last_sync_at, last_error, created_at')
      .order('created_at', { ascending: true });
    if (err) {
      setError('Connections are not set up on this account yet.');
      setLoading(false);
      return;
    }
    const list = (rows || []) as Connection[];
    setConnections(list);
    const nextSignals: Record<string, Signal[]> = {};
    const nextComments: Record<string, Signal[]> = {};
    const nextReplied: Record<string, string> = {};
    await Promise.all(list.map(async (c) => {
      const [numbers, mentions, sent] = await Promise.all([
        supabase.from('signals').select('name, value, entity, occurred_at').eq('connection_id', c.id).neq('name', 'comment').neq('name', 'reply_sent')
          .order('occurred_at', { ascending: false }).limit(120),
        supabase.from('signals').select('name, value, text_value, entity, occurred_at').eq('connection_id', c.id).eq('name', 'comment')
          .order('occurred_at', { ascending: false }).limit(12),
        supabase.from('signals').select('entity').eq('connection_id', c.id).eq('name', 'reply_sent').limit(500),
      ]);
      nextSignals[c.id] = (numbers.data || []) as Signal[];
      nextComments[c.id] = (mentions.data || []) as Signal[];
      ((sent.data || []) as Signal[]).forEach((r) => { if (r.entity?.parent_id) nextReplied[r.entity.parent_id] = 'sent'; });
    }));
    setSignals(nextSignals);
    setComments(nextComments);
    setRepliedTo(nextReplied);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    authedFetch<{ providers: Provider[] }>(`${API}/providers`).then((r) => setProviders(r.providers || [])).catch(() => { /* the list below stays empty */ });
  }, [load, authedFetch]);

  // Back from Google: say what happened once, then clean the address.
  useEffect(() => {
    const connected = params.get('connected');
    const failed = params.get('oauth_error');
    if (!connected && !failed) return;
    if (connected) showToast('Connected with Google', 'success');
    if (failed) { setError(failed); showToast(failed, 'error'); }
    setParams({}, { replace: true });
    load();
  }, [params, setParams, showToast, load]);

  const providerOf = useMemo(() => Object.fromEntries(providers.map((p) => [p.provider, p])), [providers]);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      showToast(done, 'success');
      await load();
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
      setError(msg);
      showToast(msg, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitConnect() {
    if (!adding) return;
    const ok = await act('connect', () => authedFetch(API, { method: 'POST', body: JSON.stringify({ provider: adding.provider, inputs }) }), `${adding.title} connected`);
    if (ok) { setAdding(null); setInputs({}); }
  }

  // Signing in happens on Google's own page; the server brings the person back here when they are done.
  async function signIn(provider: string) {
    setBusy(`signin-${provider}`);
    setError(null);
    try {
      const r = await authedFetch<{ url: string }>(`${API}/oauth/start`, { method: 'POST', body: JSON.stringify({ provider }) });
      window.location.href = r.url;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not start the sign-in. Try again.';
      setError(msg);
      showToast(msg, 'error');
      setBusy(null);
    }
  }

  async function sendReply(connectionId: string, parentId: string) {
    const ok = await act(`reply-${parentId}`, () => authedFetch(`${API}/${connectionId}/reply`, { method: 'POST', body: JSON.stringify({ parent_id: parentId, text: replyText }) }), 'Reply sent');
    if (ok) { setReplyOpen(null); setReplyText(''); }
  }

  function headline(c: Connection) {
    const latest: Record<string, number> = {};
    (signals[c.id] || []).forEach((s) => {
      if (s.value !== null && !s.entity?.video_id && !(s.name in latest)) latest[s.name] = s.value;
    });
    return Object.keys(METRIC_NAMES).filter((k) => k in latest).map((k) => ({ label: METRIC_NAMES[k], value: latest[k] }));
  }

  function recentItems(c: Connection) {
    const seen: Record<string, { title: string; views?: number; likes?: number; commentCount?: number }> = {};
    const order: string[] = [];
    (signals[c.id] || []).forEach((s) => {
      const id = s.entity?.video_id;
      if (!id || s.value === null) return;
      if (!seen[id]) { seen[id] = { title: s.entity?.title || id }; order.push(id); }
      const item = seen[id];
      if (s.name === 'video_views' && item.views === undefined) item.views = s.value;
      if (s.name === 'video_likes' && item.likes === undefined) item.likes = s.value;
      if (s.name === 'video_comments' && item.commentCount === undefined) item.commentCount = s.value;
    });
    return order.slice(0, 5).map((id) => seen[id]);
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <h2 style={{ marginTop: 0 }}>Connections</h2>
      <p style={noteStyle}>
        Connect the places where your customers and your audience already are. Raptor reads only what each service officially allows,
        keeps the numbers per organization, and uses them to learn what works. Passwords and keys are saved encrypted and are never shown again.
      </p>

      {error && <div role="alert" style={{ ...noteStyle, color: 'var(--red, #ef5350)', margin: '0.8rem 0' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}><span className="arsenal-spinner" /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '1rem', margin: '1.2rem 0' }}>
            {connections.map((c) => {
              const info = providerOf[c.provider];
              const st = STATUS[c.status] || STATUS.pending;
              const tiles = headline(c);
              const items = recentItems(c);
              const mentions = comments[c.id] || [];
              const canReply = !!info?.can_reply && canManage && c.status === 'connected';
              return (
                <div key={c.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--white)' }}>{c.label || info?.title || c.provider}</strong>
                    <span style={{ fontSize: '0.7rem', color: st.color }}>{st.text}</span>
                  </div>
                  <div style={noteStyle}>{info?.title || c.provider} · refreshed {ago(c.last_sync_at)}</div>
                  {c.last_error && <div style={{ ...noteStyle, color: 'var(--red, #ef5350)', marginTop: 6 }}>{c.last_error}</div>}
                  {tiles.length > 0 && (
                    <div style={{ display: 'flex', gap: '1.4rem', margin: '0.9rem 0 0.4rem', flexWrap: 'wrap' }}>
                      {tiles.map((t) => (
                        <div key={t.label}>
                          <div style={{ fontSize: '1.3rem', color: 'var(--white)' }}>{fmt(t.value)}</div>
                          <div style={{ ...noteStyle, fontSize: '0.7rem' }}>{t.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {items.length > 0 && (
                    <div style={{ marginTop: '0.7rem' }}>
                      <div style={{ ...noteStyle, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Latest videos</div>
                      {items.map((v) => (
                        <div key={v.title} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', fontSize: '0.78rem', padding: '0.25rem 0', borderTop: '1px solid var(--border)' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--white)' }}>{v.title}</span>
                          <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                            {v.views !== undefined ? `${fmt(v.views)} views` : ''}{v.commentCount !== undefined ? ` · ${fmt(v.commentCount)} comments` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mentions.length > 0 && (
                    <div style={{ marginTop: '0.9rem' }}>
                      <div style={{ ...noteStyle, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Latest comments</div>
                      {mentions.map((m) => {
                        const id = m.entity?.comment_id || '';
                        return (
                          <div key={id || m.occurred_at} style={{ padding: '0.45rem 0', borderTop: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
                              {m.entity?.author || 'Someone'}{m.entity?.title ? ` on “${m.entity.title}”` : ''} · {ago(m.occurred_at)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--white)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text_value}</div>
                            {canReply && id && (repliedTo[id] ? (
                              <div style={{ ...noteStyle, marginTop: 4 }}>You replied.</div>
                            ) : replyOpen === id ? (
                              <div style={{ marginTop: 6 }}>
                                <textarea style={{ ...fieldInputStyle, minHeight: 70, marginBottom: '0.5rem' }} value={replyText} maxLength={10000}
                                  placeholder="Write your reply. It is posted on YouTube as your channel when you press Send."
                                  onChange={(e) => setReplyText(e.target.value)} />
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} disabled={busy !== null || !replyText.trim()}
                                    onClick={() => sendReply(c.id, id)}>{busy === `reply-${id}` ? 'Sending…' : 'Send reply'}</button>
                                  <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} disabled={busy !== null} onClick={() => { setReplyOpen(null); setReplyText(''); }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" style={{ ...ghostBtnStyle, flex: 'none', marginTop: 4, padding: '0.3rem 0.7rem' }} disabled={busy !== null}
                                onClick={() => { setReplyOpen(id); setReplyText(''); }}>Reply</button>
                            ))}
                          </div>
                        );
                      })}
                      {!info?.can_reply && <div style={{ ...noteStyle, marginTop: 6 }}>To reply from Raptor, connect “YouTube (sign in)” below.</div>}
                    </div>
                  )}
                  {canManage && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {info?.auth === 'oauth' && c.status === 'error' && (
                        <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} disabled={busy !== null} onClick={() => signIn(c.provider)}>Sign in again</button>
                      )}
                      <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} disabled={busy !== null || c.status === 'paused'}
                        onClick={() => act(`sync-${c.id}`, () => authedFetch(`${API}/${c.id}/sync`, { method: 'POST' }), 'Refreshed')}>
                        {busy === `sync-${c.id}` ? 'Refreshing…' : 'Refresh now'}
                      </button>
                      <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} disabled={busy !== null}
                        onClick={() => act(`pause-${c.id}`, () => authedFetch(`${API}/${c.id}`, { method: 'PATCH', body: JSON.stringify({ paused: c.status !== 'paused' }) }), c.status === 'paused' ? 'Resumed' : 'Paused')}>
                        {c.status === 'paused' ? 'Resume' : 'Pause'}
                      </button>
                      <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} disabled={busy !== null}
                        onClick={() => { if (window.confirm(`Disconnect "${c.label}"? Its saved numbers are removed too${info?.auth === 'oauth' ? ', and Raptor’s access to your Google account is withdrawn' : ''}.`)) act(`del-${c.id}`, () => authedFetch(`${API}/${c.id}`, { method: 'DELETE' }), 'Disconnected'); }}>
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {connections.length === 0 && <p style={noteStyle}>Nothing is connected yet. Pick one below to start.</p>}

          <h3 style={{ marginBottom: '0.6rem' }}>{connections.length ? 'Add another' : 'Add your first'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '0.8rem' }}>
            {providers.map((p) => (
              <div key={p.provider} style={cardStyle}>
                <strong style={{ color: 'var(--white)' }}>{p.title}</strong>
                <div style={{ ...noteStyle, margin: '0.3rem 0 0.8rem' }}>{p.description}</div>
                <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} disabled={!p.available || !canManage || busy !== null}
                  onClick={() => { if (p.auth === 'oauth') { signIn(p.provider); } else { setAdding(p); setInputs({}); setError(null); } }}>
                  {!p.available ? 'Coming soon' : p.auth === 'oauth' ? (busy === `signin-${p.provider}` ? 'Opening Google…' : 'Sign in with Google') : 'Connect'}
                </button>
              </div>
            ))}
          </div>
          {!canManage && <p style={noteStyle}>You can see your organization&rsquo;s connections. Changing them needs the &ldquo;manage automations&rdquo; permission from your owner.</p>}
        </>
      )}

      {adding && (
        <div style={{ ...cardStyle, marginTop: '1.4rem', maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Connect {adding.title}</h3>
          {adding.fields.map((f) => (
            <div key={f.name}>
              <label style={labelStyle} htmlFor={`conn-${f.name}`}>{f.label}</label>
              <input id={`conn-${f.name}`} style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} type={f.secret ? 'password' : 'text'}
                autoComplete="off" placeholder={f.placeholder} value={inputs[f.name] || ''}
                onChange={(e) => setInputs((i) => ({ ...i, [f.name]: e.target.value }))} />
              {f.help && <div style={{ ...noteStyle, marginBottom: '1rem' }}>{f.help}</div>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="button" style={primaryBtnStyle} disabled={busy !== null} onClick={submitConnect}>{busy === 'connect' ? 'Connecting…' : 'Connect'}</button>
            <button type="button" style={ghostBtnStyle} disabled={busy !== null} onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
