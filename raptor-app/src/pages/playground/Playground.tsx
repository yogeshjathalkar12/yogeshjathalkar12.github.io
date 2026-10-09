import { useEffect, useRef, useState } from 'react';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { toolApiBase } from '../../lib/config';
import { supabase } from '../../lib/supabaseClient';
import { loadPipelineStages, openStageKeys } from '../../lib/pipelineStages';

const PLAYGROUND_API = toolApiBase('playground');
const CONTENT_API = toolApiBase('content'); // reuse the same saved AI keys, no separate key entry here

type Mode = 'lead_roleplay' | 'coaching';

interface KeyEntry { provider: string; capabilities: Record<string, boolean>; }
interface Deal { id: string; title: string; stage: string; value: number; companies?: { name: string }[]; contacts?: { name: string }[]; }
interface SessionSummary { id: string; mode: Mode; title: string; provider: string; created_at: string; }
interface Message { role: 'user' | 'assistant'; content: string; created_at: string; }
interface Attachment { name: string; text: string; }

// Files travel inside the message text between these markers, so nothing changes on the server;
// the chat shows them as chips instead of dumping the whole file.
const ATT_RE = /\[\[attachment: (.+?)\]\]\n([\s\S]*?)\n\[\[\/attachment\]\]\n?/g;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TOTAL_CHARS = 40000;
const TEXT_FILE_TYPES = '.txt,.md,.csv,.json,.log,.html,.htm,.xml,.yaml,.yml,.tsv';

function splitMessage(content: string): { text: string; files: { name: string; chars: number }[] } {
  const files: { name: string; chars: number }[] = [];
  const text = content.replace(ATT_RE, (_m, name: string, body: string) => {
    files.push({ name, chars: body.length });
    return '';
  }).trim();
  return { text, files };
}

// Browsers expose speech through a prefixed, untyped API; Chrome and Edge have it, Firefox does not.
const SpeechRec: any = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

const iconBtn = (active = false): React.CSSProperties => ({
  width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: active ? 'var(--red)' : 'var(--surface2)', color: active ? '#fff' : 'var(--white)',
  border: '1px solid ' + (active ? 'var(--red)' : 'var(--border)'), borderRadius: 6, cursor: 'pointer',
});

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
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [extraContext, setExtraContext] = useState('');
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const heardRef = useRef('');
  const baseDraftRef = useRef('');
  const activeSessionRef = useRef<string | null>(null);
  activeSessionRef.current = activeSessionId;

  useEffect(() => {
    loadKeys();
    loadDeals();
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // The message box grows with what you type (up to ~8 lines) instead of staying one tiny line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [draft]);

  useEffect(() => () => {
    voiceModeRef.current = false;
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    if (canSpeak) window.speechSynthesis.cancel();
  }, []);

  async function loadKeys() {
    const json = await authedFetch<{ keys: KeyEntry[] }>(`${CONTENT_API}/keys`);
    const textCapable = json.keys.filter((k: any) => k.capabilities?.text);
    setKeys(textCapable);
    if (textCapable.length > 0) setProvider(textCapable[0].provider);
  }

  async function loadDeals() {
    let openKeys: string[] = [];
    try {
      const stageRows = await loadPipelineStages();
      openKeys = openStageKeys(stageRows);
      setStageLabels(Object.fromEntries(stageRows.map((st) => [st.key, st.label])));
    } catch { /* fall back to the old won/lost filter */ }
    let query = supabase
      .from('deals')
      .select('id, title, stage, value, companies(name), contacts(name)')
      .order('updated_at', { ascending: false })
      .limit(50);
    query = openKeys.length > 0 ? query.in('stage', openKeys) : query.neq('stage', 'won').neq('stage', 'lost');
    const { data } = await query;
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

  async function sendMessage(override?: string) {
    const typed = (override ?? draft).trim();
    if ((!typed && attachments.length === 0) || !activeSessionId || sending) return;

    let fileBlocks = '';
    let budget = MAX_TOTAL_CHARS;
    for (const a of attachments) {
      const body = a.text.slice(0, Math.max(budget, 0));
      budget -= body.length;
      fileBlocks += `[[attachment: ${a.name}]]\n${body}${body.length < a.text.length ? '\n…(truncated)' : ''}\n[[/attachment]]\n`;
    }
    if (attachments.some((a) => a.text.length > MAX_TOTAL_CHARS) || attachments.reduce((n, a) => n + a.text.length, 0) > MAX_TOTAL_CHARS) {
      showToast('Attachments were long, so only the first part was sent to the AI', 'warn');
    }
    const userMsg = (fileBlocks + (typed || 'Please look at the attached file(s).')).trim();

    setMessages((prev) => [...prev, { role: 'user', content: userMsg, created_at: new Date().toISOString() }]);
    setDraft('');
    setAttachments([]);
    setSending(true);
    let replied = false;
    try {
      const json = await authedFetch<{ reply: string }>(`${PLAYGROUND_API}/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: userMsg }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply, created_at: new Date().toISOString() }]);
      replied = true;
      if (voiceModeRef.current) speak(json.reply);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Message failed', 'error');
    } finally {
      setSending(false);
      if (!replied && voiceModeRef.current) startListening(false);
    }
  }

  // ---- voice -------------------------------------------------------------------------------
  function stopListening() {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }

  function startListening(dictation: boolean) {
    if (!SpeechRec) return showToast('Voice input needs Chrome or Edge — this browser does not support it', 'error');
    try { recRef.current?.abort(); } catch { /* none running */ }
    const rec = new SpeechRec();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = dictation; // dictation keeps going until you stop it; voice chat takes one sentence at a time
    heardRef.current = '';
    baseDraftRef.current = dictation && draft.trim() ? draft.trim() + ' ' : '';

    rec.onresult = (ev: any) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardRef.current = (finalText + interim).trim();
      setDraft(baseDraftRef.current + (finalText + interim));
    };
    rec.onerror = (ev: any) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        voiceModeRef.current = false;
        setVoiceMode(false);
        showToast('Microphone is blocked — allow it in the address bar to use voice', 'error');
      } else if (ev.error === 'audio-capture') {
        voiceModeRef.current = false;
        setVoiceMode(false);
        showToast('No microphone found', 'error');
      }
    };
    rec.onend = () => {
      setListening(false);
      if (recRef.current !== rec) return;
      if (voiceModeRef.current) {
        const said = heardRef.current;
        if (said && activeSessionRef.current) sendMessage(said);
        else setTimeout(() => { if (voiceModeRef.current) startListening(false); }, 400); // heard nothing, keep waiting
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function speak(text: string) {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, ''));
    u.lang = navigator.language || 'en-US';
    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      setSpeaking(false);
      if (voiceModeRef.current) startListening(false);
    };
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  function toggleDictation() {
    if (listening) { stopListening(); return; }
    startListening(true);
  }

  function toggleVoiceChat() {
    if (!activeSessionId) return showToast('Start a session first', 'error');
    if (voiceMode) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      stopListening();
      if (canSpeak) window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!SpeechRec) return showToast('Voice chat needs Chrome or Edge', 'error');
    voiceModeRef.current = true;
    setVoiceMode(true);
    startListening(false);
  }

  // ---- attachments -------------------------------------------------------------------------
  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = [...attachments];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { showToast(`Up to ${MAX_FILES} files at a time`, 'error'); break; }
      if (f.size > MAX_FILE_BYTES) { showToast(`${f.name} is over ${MAX_FILE_BYTES / 1024} KB`, 'error'); continue; }
      try {
        const text = await f.text();
        if (text.includes('\u0000')) { showToast(`${f.name} is not a text file`, 'error'); continue; }
        next.push({ name: f.name, text });
      } catch {
        showToast(`Could not read ${f.name}`, 'error');
      }
    }
    setAttachments(next);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
          Practice Space
        </div>
        <h1 style={{ margin: '0.3rem 0', color: 'var(--purple)' }}>AI Playground</h1>
        <p style={{ color: 'var(--dim)', maxWidth: '640px', fontSize: '0.85rem' }}>
          Roleplay a real lead from your CRM to rehearse a call, or get general sales coaching —
          both run on your own saved AI provider key.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
        <div style={{ overflowY: 'auto' }}>
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
                          {(d.contacts as any)?.name || d.title} — {(d.companies as any)?.name || ''} ({stageLabels[d.stage] || d.stage})
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

        <div className="arsenal-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {!activeSessionId && (
              <div className="arsenal-empty">
                <div className="arsenal-empty-text">Start a session on the left to begin.</div>
              </div>
            )}
            {messages.map((m, i) => {
              const { text, files } = splitMessage(m.content);
              return (
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
                    {files.map((f, k) => (
                      <div key={k} style={{ display: 'inline-block', marginBottom: '0.4rem', marginRight: '0.4rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(255,255,255,0.18)', fontSize: '0.65rem' }}>
                        📎 {f.name}
                      </div>
                    ))}
                    {files.length > 0 && text && <br />}
                    {text}
                  </div>
                  {m.role === 'assistant' && canSpeak && (
                    <button
                      type="button"
                      onClick={() => speak(m.content)}
                      style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '0.6rem', cursor: 'pointer', padding: '0.2rem 0.3rem' }}
                    >
                      ▶ Listen
                    </button>
                  )}
                </div>
              );
            })}
            {sending && (
              <div style={{ alignSelf: 'flex-start', color: 'var(--dim)', fontSize: '0.7rem', padding: '0 0.4rem' }}>Thinking…</div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', padding: '0.8rem' }}>
            {voiceMode && (
              <div style={{ marginBottom: '0.6rem', padding: '0.45rem 0.7rem', borderRadius: 6, background: 'rgba(168,85,247,0.12)', color: 'var(--white)', fontSize: '0.7rem' }}>
                🎙 Voice chat is on — {speaking ? 'the AI is speaking…' : sending ? 'thinking…' : listening ? 'listening, just talk' : 'starting…'}
              </div>
            )}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
                {attachments.map((a, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem', borderRadius: 999, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontSize: '0.65rem' }}>
                    📎 {a.name}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 0 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <input ref={fileRef} type="file" multiple accept={TEXT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
              <button type="button" title="Attach text files (txt, md, csv, json…)" style={iconBtn()} disabled={!activeSessionId || sending} onClick={() => fileRef.current?.click()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <textarea
                ref={inputRef}
                className="arsenal-input"
                rows={1}
                style={{ flex: 1, minWidth: 0, width: 'auto', minHeight: 44, maxHeight: 180, resize: 'none', fontSize: '0.85rem', lineHeight: 1.5, padding: '0.7rem 0.9rem' }}
                value={draft}
                disabled={!activeSessionId || sending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={activeSessionId ? 'Type your message…  (Enter to send, Shift+Enter for a new line)' : 'Start a session first'}
              />
              <button type="button" title={listening && !voiceMode ? 'Stop dictation' : 'Dictate with your voice'} style={iconBtn(listening && !voiceMode)} disabled={!activeSessionId || sending || voiceMode} onClick={toggleDictation}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
              </button>
              <button type="button" title={voiceMode ? 'End voice chat' : 'Voice chat: talk and hear the replies'} style={iconBtn(voiceMode)} disabled={!activeSessionId} onClick={toggleVoiceChat}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4M22 12h-1" /></svg>
              </button>
              <button
                className="arsenal-btn"
                style={{ width: 'auto', minWidth: 90, height: 44, padding: '0 1.2rem', flexShrink: 0 }}
                disabled={!activeSessionId || sending || (!draft.trim() && attachments.length === 0)}
                onClick={() => sendMessage()}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}