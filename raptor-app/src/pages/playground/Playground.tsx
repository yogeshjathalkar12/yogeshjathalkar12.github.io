import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { supabase } from '../../lib/supabaseClient';

const PLAYGROUND_API = toolApiBase('playground');
const CONTENT_API = toolApiBase('content'); // reuse the same saved AI keys, no separate key entry here

type Mode = 'lead_roleplay' | 'coaching';

interface KeyEntry { provider: string; capabilities: Record<string, boolean>; }
interface Deal { id: string; title: string; stage: string; value: number; companies?: { name: string }[]; contacts?: { name: string }[]; }
interface SessionSummary { id: string; mode: Mode; title: string; provider: string; created_at: string; }
interface Message { role: 'user' | 'assistant'; content: string; created_at: string; }

export default function Playground() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [mode, setMode] = useState<Mode>('lead_roleplay');
  const [provider, setProvider] = useState('');
  const [dealId, setDealId] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadKeys();
    loadDeals();
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function loadKeys() {
    const json = await authedFetch<{ keys: KeyEntry[] }>(`${CONTENT_API}/keys`);
    const textCapable = json.keys.filter((k: any) => k.capabilities?.text);
    setKeys(textCapable);
    if (textCapable.length > 0) setProvider(textCapable[0].provider);
  }

  async function loadDeals() {
    const { data } = await supabase
      .from('deals')
      .select('id, title, stage, value, companies(name), contacts(name)')
      .neq('stage', 'won')
      .neq('stage', 'lost')
      .order('updated_at', { ascending: false })
      .limit(50);
    setDeals(data || []);
  }

  async function loadSessions() {
    try {
      const json = await authedFetch<{ sessions: SessionSummary[] }>(`${PLAYGROUND_API}/sessions`, { skipCreditsSync: true });
      setSessions(json.sessions);
    } catch {
      // non-fatal
    }
  }

  async function openSession(id: string) {
    setActiveSessionId(id);
    try {
      const json = await authedFetch<{ messages: Message[] }>(`${PLAYGROUND_API}/sessions/${id}/messages`, { skipCreditsSync: true });
      setMessages(json.messages);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load session', 'error');
    }
  }

  async function startSession() {
    if (!provider) return showToast('Add an AI provider key first — see "Manage AI Provider Keys" in your profile menu', 'error');
    if (mode === 'lead_roleplay' && !dealId) return showToast('Pick a lead to roleplay', 'error');
    setStarting(true);
    try {
      const body: Record<string, string> = { mode, provider };
      if (mode === 'lead_roleplay') {
        body.deal_id = dealId;
        body.extra_context = extraContext;
      } else {
        body.topic = topic;
      }
      const session = await authedFetch<SessionSummary>(`${PLAYGROUND_API}/sessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessages([]);
      setActiveSessionId(session.id);
      loadSessions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start session', 'error');
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage() {
    if (!draft.trim() || !activeSessionId) return;
    const userMsg = draft.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMsg, created_at: new Date().toISOString() }]);
    setDraft('');
    setSending(true);
    try {
      const json = await authedFetch<{ reply: string }>(`${PLAYGROUND_API}/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: userMsg }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply, created_at: new Date().toISOString() }]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Message failed', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="arsenal-topbar">
        <Link to="/dashboard" className="arsenal-back">← Dashboard</Link>
        <div className="arsenal-tool-badge"><span className="dot" />AI PLAYGROUND</div>
        <div className="arsenal-topbar-right" />
      </header>

      <main className="arsenal-main">
        <section className="arsenal-hero">
          <div className="arsenal-hero-eyebrow">Practice Space</div>
          <h1 className="arsenal-hero-title">AI Playground</h1>
          <p className="arsenal-hero-desc">
            Roleplay a real lead from your CRM to rehearse a call, or get general sales coaching —
            both run on your own saved AI provider key.
          </p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
          <div>
            <div className="arsenal-card" style={{ marginBottom: '1rem' }}>
              <div className="arsenal-card-header"><span className="arsenal-card-title">New Session</span></div>
              <div className="arsenal-card-body">
                <div className="arsenal-field">
                  <label className="arsenal-label">Mode</label>
                  <select className="arsenal-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                    <option value="lead_roleplay">Roleplay a Lead</option>
                    <option value="coaching">General Coaching</option>
                  </select>
                </div>

                <div className="arsenal-field">
                  <label className="arsenal-label">AI Provider</label>
                  <select className="arsenal-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                    <option value="">Select…</option>
                    {keys.map((k) => <option key={k.provider} value={k.provider}>{k.provider}</option>)}
                  </select>
                  {keys.length === 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: '0.3rem' }}>
                      No saved key yet — add one under AI Content Suite first.
                    </div>
                  )}
                </div>

                {mode === 'lead_roleplay' ? (
                  <>
                    <div className="arsenal-field">
                      <label className="arsenal-label">Lead</label>
                      <select className="arsenal-input" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                        <option value="">Select…</option>
                        {deals.map((d) => (
                          <option key={d.id} value={d.id}>
                            {(d.contacts as any)?.name || d.title} — {(d.companies as any)?.name || ''} ({d.stage})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="arsenal-field">
                      <label className="arsenal-label">Extra context (optional)</label>
                      <textarea
                        className="arsenal-input"
                        style={{ minHeight: 70 }}
                        value={extraContext}
                        onChange={(e) => setExtraContext(e.target.value)}
                        placeholder="Anything specific about this prospect to roleplay against"
                      />
                    </div>
                  </>
                ) : (
                  <div className="arsenal-field">
                    <label className="arsenal-label">Topic (optional)</label>
                    <input
                      className="arsenal-input"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. handling price objections"
                    />
                  </div>
                )}

                <button className="arsenal-btn" disabled={starting} onClick={startSession}>
                  {starting ? 'Starting…' : 'Start Session →'}
                </button>
              </div>
            </div>

            <div className="arsenal-card">
              <div className="arsenal-card-header"><span className="arsenal-card-title">History</span></div>
              <div className="arsenal-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sessions.length === 0 && <div style={{ color: 'var(--dim2)', fontSize: '0.7rem' }}>No sessions yet.</div>}
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => openSession(s.id)}
                    style={{
                      padding: '0.5rem 0.7rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: activeSessionId === s.id ? 'var(--accent-dim)' : 'transparent',
                      fontSize: '0.7rem',
                      color: 'var(--white)',
                    }}
                  >
                    {s.title}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="arsenal-card" style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {!activeSessionId && (
                <div className="arsenal-empty">
                  <div className="arsenal-empty-text">Start a session on the left to begin.</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                  <div
                    style={{
                      background: m.role === 'user' ? 'var(--grad)' : 'var(--bg-card)',
                      color: m.role === 'user' ? '#fff' : 'var(--white)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '0.6rem 0.9rem',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', padding: '0.8rem', display: 'flex', gap: '0.6rem' }}>
              <input
                className="arsenal-input"
                style={{ flex: 1 }}
                value={draft}
                disabled={!activeSessionId || sending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                placeholder={activeSessionId ? 'Type your message…' : 'Start a session first'}
              />
              <button className="arsenal-btn" disabled={!activeSessionId || sending} onClick={sendMessage}>
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}