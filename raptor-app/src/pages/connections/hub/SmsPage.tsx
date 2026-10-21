import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHANNELS } from './channels';
import type { Connection } from './core';
import { smsApi } from './env';
import { smsInsights, named, fmtAgo, fmtNum, time } from './insights';
import { Shell, connectionsOf } from './pagekit';
import type { PageProps } from './pagekit';
import SmsSettingsPanel from './SmsSettingsPanel';
import type { EnrollResult, SmsApi, SmsDealChoice, SmsEnrollment, SmsMessage, SmsRule, SmsSequence, SmsStep } from './smsApi';
import { MAX_ENROLL, SOURCE_TEXT, TAGS, characters, dueText, groupThreads, statusText } from './smsApi';
import { Card, CopyBox, Empty, InsightList, Notice, Tile, TileRow, buttonStyle, inputStyle, note } from './ui';

// The SMS tab under Channels: your own Twilio number, used ONE PERSON AT A TIME. An inbox of conversations, follow-up sequences you
// start for chosen deals (never for a list), keyword auto-replies, and the settings the CRM pipeline's SMS button uses. See raptor/sms/.

export const SMS_DAILY_CAP = 200;   // keep in step with DAILY_CAP in the server's connections/sms.py
const REFRESH_MS = 20000;
type Tab = 'inbox' | 'sequences' | 'rules' | 'settings' | 'overview';
const TABS: { key: Tab; label: string }[] = [
  { key: 'inbox', label: 'Inbox' }, { key: 'sequences', label: 'Follow-ups' }, { key: 'rules', label: 'Auto-replies' },
  { key: 'settings', label: 'Settings' }, { key: 'overview', label: 'Overview' },
];
const TONE = { good: '#3ecf8e', warn: '#f59e0b', dim: 'var(--dim)' };

interface Loaded {
  messages: SmsMessage[]; names: Record<string, string>; sequences: SmsSequence[]; rules: SmsRule[]; enrollments: SmsEnrollment[];
  optouts: { phone: string; created_at: string }[]; error: string | null; ready: boolean;
}
const EMPTY: Loaded = { messages: [], names: {}, sequences: [], rules: [], enrollments: [], optouts: [], error: null, ready: false };

function useSmsData(api: SmsApi) {
  const [state, setState] = useState<Loaded>(EMPTY);
  const reload = useCallback(async () => {
    try {
      const [messages, sequences, rules, enrollments, optouts] = await Promise.all([api.messages(), api.sequences(), api.rules(), api.enrollments(), api.optouts()]);
      const names = await api.contactNames(messages.map((m) => m.contact_id || ''));
      setState({ messages, names, sequences, rules, enrollments, optouts, error: null, ready: true });
    } catch (err: any) {
      setState((s) => ({ ...s, error: err.message, ready: true }));
    }
  }, [api]);
  useEffect(() => {
    reload();
    const timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) reload(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);
  return { ...state, reload };
}

const tabBar = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px', cursor: 'pointer', fontSize: 13, background: 'transparent', color: active ? 'var(--white)' : 'var(--dim)', fontFamily: 'inherit',
  border: 'none', borderBottom: `2px solid ${active ? 'var(--purple, #8b5cf6)' : 'transparent'}`,
});

// ───────────────────────────── Inbox ─────────────────────────────

function Inbox({ api, data, numberId, canSend }: { api: SmsApi; data: Loaded & { reload: () => Promise<void> }; numberId?: string; canSend: boolean }) {
  const threads = useMemo(() => groupThreads(data.messages, data.names), [data.messages, data.names]);
  const [phone, setPhone] = useState<string>('');
  const [text, setText] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const opted = useMemo(() => new Set(data.optouts.map((o) => o.phone)), [data.optouts]);
  const active = threads.find((t) => t.phone === phone) || null;
  const target = active ? active.phone : newPhone.trim();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const sent = await api.send(text.trim(), { phone: target, connectionId: numberId });
      setText('');
      setMsg({ tone: 'good', text: 'Message sent.' });
      if (!active) { setPhone(sent.phone || target); setNewPhone(''); }
      await data.reload();
    } catch (err: any) {
      setMsg({ tone: 'warn', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
      <Card title="Conversations" right={<button type="button" style={buttonStyle('ghost')} onClick={() => { setPhone(''); setMsg(null); }}>New text</button>}>
        {!data.ready ? <Empty>Loading…</Empty> : threads.length === 0 ? <Empty>No text messages yet. Replies from your contacts appear here.</Empty> : (
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {threads.map((t) => (
              <button key={t.phone} type="button" onClick={() => { setPhone(t.phone); setMsg(null); }} aria-label={`Conversation with ${t.name || t.phone}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                  background: t.phone === phone ? 'rgba(139,92,246,0.10)' : 'transparent', color: 'var(--white)', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                  <span>{t.name || t.phone}{t.waiting ? <span style={{ color: TONE.warn }}> · waiting for your answer</span> : null}{opted.has(t.phone) ? <span style={{ color: '#ef5350' }}> · opted out</span> : null}</span>
                  <span style={note}>{fmtAgo(t.last.created_at)}</span>
                </div>
                <div style={{ ...note, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last.direction === 'out' ? 'You: ' : ''}{t.last.body}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title={active ? `${active.name || active.phone}${active.name ? ` · ${active.phone}` : ''}` : 'New text message'}>
        {data.error ? <Notice tone="warn">{data.error}</Notice> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        {active ? (
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}>
            {active.messages.map((m) => {
              const s = statusText(m);
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start', margin: '6px 0' }}>
                  <div style={{ maxWidth: '82%', padding: '8px 11px', borderRadius: 10, background: m.direction === 'out' ? 'rgba(139,92,246,0.16)' : 'var(--surface2, rgba(255,255,255,0.05))' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    <div style={{ fontSize: 11, color: TONE[s.tone], marginTop: 3 }}>
                      {s.text}{SOURCE_TEXT[m.source] ? ` · ${SOURCE_TEXT[m.source]}` : ''} · {fmtAgo(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <input aria-label="Phone number" style={inputStyle} value={newPhone} placeholder="+919876543210" onChange={(e) => setNewPhone(e.target.value)} />
            <div style={note}>With the country code. Only text people who agreed to hear from you.</div>
          </div>
        )}
        {active && opted.has(active.phone) ? <Notice tone="warn">This person opted out. Raptor will not text them again unless they text START.</Notice> : null}
        {canSend ? (
          <form onSubmit={send}>
            <textarea aria-label="Message" rows={3} style={{ ...inputStyle, resize: 'vertical' }} maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={active ? 'Write your answer…' : 'Write your message…'} />
            <div style={{ ...note, margin: '4px 0 8px' }}>{characters(text)}</div>
            <button type="submit" style={buttonStyle('primary', busy || !target || !text.trim())} disabled={busy || !target || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
          </form>
        ) : <div style={note}>You do not have permission to send text messages.</div>}
      </Card>
    </div>
  );
}

// ───────────────────────────── Follow-ups (sequences) ─────────────────────────────

const blankStep = (): SmsStep => ({ delay_hours: 24, text: '' });

function SequenceForm({ initial, onSave, onCancel }: { initial?: SmsSequence; onSave: (name: string, steps: SmsStep[], stopOnReply: boolean) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [steps, setSteps] = useState<SmsStep[]>(initial ? initial.steps : [blankStep()]);
  const [stop, setStop] = useState(initial ? initial.stop_on_reply : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (i: number, patch: Partial<SmsStep>) => setSteps((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await onSave(name.trim(), steps.map((s) => ({ delay_hours: Number(s.delay_hours) || 0, text: s.text.trim() })), stop); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ maxWidth: 620 }}>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <label style={{ display: 'block', fontSize: 12, color: 'var(--white)', marginBottom: 5 }} htmlFor="seq-name">Name</label>
      <input id="seq-name" style={{ ...inputStyle, marginBottom: 12 }} value={name} maxLength={80} placeholder="Gentle follow-up" onChange={(e) => setName(e.target.value)} />
      {steps.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 12.5, color: 'var(--white)' }}>Text {i + 1}</strong>
            <span style={note}>{i === 0 ? 'Send' : 'Then wait'}</span>
            <input aria-label={`Hours before text ${i + 1}`} type="number" min={0} max={720} style={{ ...inputStyle, width: 90 }} value={s.delay_hours} onChange={(e) => change(i, { delay_hours: Number(e.target.value) })} />
            <span style={note}>hours{i === 0 ? ' after the person is added' : ''}</span>
            {steps.length > 1 ? <button type="button" style={{ ...buttonStyle('ghost'), marginLeft: 'auto' }} onClick={() => setSteps((list) => list.filter((_x, k) => k !== i))}>Remove</button> : null}
          </div>
          <textarea aria-label={`Text ${i + 1}`} rows={2} style={{ ...inputStyle, resize: 'vertical' }} maxLength={480} value={s.text} placeholder="Hi {{first_name}}, just checking you saw my earlier note…" onChange={(e) => change(i, { text: e.target.value })} />
          <div style={note}>{characters(s.text)}</div>
        </div>
      ))}
      <div style={{ ...note, marginBottom: 10 }}>Tags: {TAGS.map((t) => `{{${t}}}`).join('  ')}</div>
      {steps.length < 6 ? <button type="button" style={{ ...buttonStyle('ghost'), marginBottom: 12 }} onClick={() => setSteps((list) => [...list, blankStep()])}>Add another text</button> : null}
      <label style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--white)', marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Stop as soon as the person replies <span style={note}>(recommended)</span></span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={buttonStyle('ghost')} onClick={onCancel}>Cancel</button>
        <button type="submit" style={buttonStyle('primary', busy)} disabled={busy}>{busy ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </form>
  );
}

function EnrollPicker({ api, sequence, onDone }: { api: SmsApi; sequence: SmsSequence; onDone: () => Promise<void> }) {
  const [deals, setDeals] = useState<SmsDealChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EnrollResult[] | null>(null);
  useEffect(() => { api.dealChoices().then(setDeals).catch((err) => { setError(err.message); setDeals([]); }); }, [api]);
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_ENROLL ? list : [...list, id]));
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const out = await api.enroll(sequence.id, picked);
      setResults(out.results);
      setPicked([]);
      await onDone();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  const title = (d: SmsDealChoice) => d.name || d.title;
  return (
    <div>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {deals === null ? <Empty>Loading deals…</Empty> : deals.length === 0 ? <Empty>No deal has a contact with a phone number yet.</Empty> : (
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {deals.map((d) => (
            <label key={d.id} style={{ display: 'flex', gap: 9, padding: '7px 10px', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--white)' }}>
              <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} aria-label={`Choose ${title(d)}`} />
              <span>{title(d)}<span style={note}> · {d.company || d.title} · {d.phone}</span></span>
            </label>
          ))}
        </div>
      )}
      <div style={{ ...note, margin: '8px 0' }}>Choose up to {MAX_ENROLL} people. Texts go to people you pick, not to a list. {picked.length} chosen.</div>
      <button type="button" style={buttonStyle('primary', busy || picked.length === 0)} disabled={busy || picked.length === 0} onClick={go}>{busy ? 'Adding…' : `Start this follow-up for ${picked.length}`}</button>
      {results ? (
        <div style={{ marginTop: 10 }}>
          {results.map((r) => <div key={r.deal_id} style={{ ...note, color: r.result === 'enrolled' ? TONE.good : TONE.warn }}>{(deals || []).find((d) => d.id === r.deal_id)?.name || r.deal_id}: {r.result === 'enrolled' ? 'added' : r.reason}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function Sequences({ api, data, canManage }: { api: SmsApi; data: Loaded & { reload: () => Promise<void> }; canManage: boolean }) {
  const [editing, setEditing] = useState<SmsSequence | 'new' | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counts = (id: string) => data.enrollments.filter((e) => e.sequence_id === id && e.status === 'active').length;
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await data.reload(); } catch (err: any) { setError(err.message); } };

  if (editing) {
    return (
      <Card title={editing === 'new' ? 'New follow-up' : 'Change follow-up'}>
        <SequenceForm initial={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)}
          onSave={async (name, steps, stop) => {
            if (editing === 'new') await api.createSequence(name, steps, stop);
            else await api.updateSequence(editing.id, { name, steps, stop_on_reply: stop });
            setEditing(null);
            await data.reload();
          }} />
      </Card>
    );
  }
  const active = data.enrollments.filter((e) => e.status === 'active');
  return (
    <div>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Card title="Follow-ups" right={canManage ? <button type="button" style={buttonStyle('primary')} onClick={() => setEditing('new')}>New follow-up</button> : undefined}>
        {data.sequences.length === 0 ? <Empty>No follow-up yet. A follow-up is a short series of texts that goes to people you choose, and stops by itself when they answer.</Empty> : data.sequences.map((q) => (
          <div key={q.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--white)', fontSize: 14 }}>{q.name}</strong>
              <span style={note}>{q.steps.length} text{q.steps.length === 1 ? '' : 's'} · {counts(q.id)} in progress{q.is_active ? '' : ' · switched off'}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" style={buttonStyle('ghost')} onClick={() => setEnrolling(enrolling === q.id ? null : q.id)} disabled={!q.is_active}>Choose people</button>
                {canManage ? <>
                  <button type="button" style={buttonStyle('ghost')} onClick={() => setEditing(q)}>Edit</button>
                  <button type="button" style={buttonStyle('ghost')} onClick={() => run(() => api.updateSequence(q.id, { is_active: !q.is_active }))}>{q.is_active ? 'Switch off' : 'Switch on'}</button>
                  <button type="button" style={buttonStyle('danger')} onClick={() => { if (window.confirm(`Delete “${q.name}”? People in it stop receiving texts.`)) run(() => api.deleteSequence(q.id)); }}>Delete</button>
                </> : null}
              </span>
            </div>
            <ol style={{ ...note, margin: '6px 0 0 18px', padding: 0 }}>
              {q.steps.map((s, i) => <li key={i}>{i === 0 ? 'After' : 'Then after'} {s.delay_hours} h: {s.text}</li>)}
            </ol>
            {enrolling === q.id ? <div style={{ marginTop: 10 }}><EnrollPicker api={api} sequence={q} onDone={data.reload} /></div> : null}
          </div>
        ))}
      </Card>
      <div style={{ margin: '14px 0' }}>
        <Card title="In progress">
          {active.length === 0 ? <Empty>Nobody is in a follow-up right now.</Empty> : active.slice(0, 40).map((e) => {
            const q = data.sequences.find((s) => s.id === e.sequence_id);
            return (
              <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--white)', flexWrap: 'wrap' }}>
                <span>{e.phone}</span>
                <span style={note}>{q ? q.name : 'Follow-up'} · text {Math.min(e.step + 1, q ? q.steps.length : e.step + 1)} {dueText(e.next_at)}</span>
                <button type="button" style={{ ...buttonStyle('ghost'), marginLeft: 'auto' }} onClick={() => run(() => api.stopEnrollment(e.id))}>Stop</button>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────────── Auto-replies ─────────────────────────────

function Rules({ api, data, canManage }: { api: SmsApi; data: Loaded & { reload: () => Promise<void> }; canManage: boolean }) {
  const [keyword, setKeyword] = useState('');
  const [reply, setReply] = useState('');
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); setBusy(true); try { await fn(); await data.reload(); } catch (err: any) { setError(err.message); } finally { setBusy(false); } };
  return (
    <div>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Card title="Answer incoming texts automatically">
        <div style={{ ...note, marginBottom: 10 }}>When someone texts a word you listed, Raptor answers once. The same person gets at most one automatic answer per 10 minutes and three a day. STOP and START are handled by Raptor itself.</div>
        {data.rules.length === 0 ? <Empty>No rule yet.</Empty> : data.rules.map((r) => (
          <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ fontSize: 13.5, color: 'var(--white)' }}>When a text {r.match_type === 'exact' ? 'is exactly' : 'contains'} “{r.keyword}”{r.is_active ? '' : ' (switched off)'}</div>
              <div style={note}>Answer: {r.reply_text}</div>
            </div>
            {canManage ? <>
              <button type="button" style={buttonStyle('ghost')} onClick={() => run(() => api.updateRule(r.id, { is_active: !r.is_active }))}>{r.is_active ? 'Switch off' : 'Switch on'}</button>
              <button type="button" style={buttonStyle('danger')} onClick={() => run(() => api.deleteRule(r.id))}>Delete</button>
            </> : null}
          </div>
        ))}
      </Card>
      {canManage ? (
        <div style={{ margin: '14px 0' }}>
          <Card title="New rule">
            <form style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api.createRule(keyword.trim(), reply.trim(), exact ? 'exact' : 'contains'); setKeyword(''); setReply(''); }); }}>
              <input aria-label="Keyword" style={{ ...inputStyle, marginBottom: 8 }} value={keyword} maxLength={60} placeholder="Keyword, for example price" onChange={(e) => setKeyword(e.target.value)} />
              <label style={{ display: 'flex', gap: 8, ...note, marginBottom: 8, cursor: 'pointer' }}><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Only when the whole text is this word</label>
              <textarea aria-label="Answer" rows={3} style={{ ...inputStyle, resize: 'vertical' }} maxLength={480} value={reply} placeholder="Our plans start at Rs 999 a month. Want me to call you today?" onChange={(e) => setReply(e.target.value)} />
              <div style={{ ...note, margin: '4px 0 8px' }}>{characters(reply)}</div>
              <button type="submit" style={buttonStyle('primary', busy || !keyword.trim() || !reply.trim())} disabled={busy || !keyword.trim() || !reply.trim()}>Add rule</button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────── Settings, webhook, opt-outs ─────────────────────────────

function Webhook({ api, connectionId }: { api: SmsApi; connectionId: string }) {
  const [info, setInfo] = useState<{ url: string; configured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.webhook(connectionId).then(setInfo).catch((err) => setError(err.message)); }, [api, connectionId]);
  async function setup() {
    setBusy(true);
    setError(null);
    try { setInfo(await api.setupWebhook(connectionId)); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Card title="Receiving replies">
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {info ? (
        <>
          {info.configured
            ? <Notice tone="good">Replies and STOP messages reach Raptor.</Notice>
            : <Notice tone="warn">Raptor is not receiving replies yet. Press the button, or paste the address below into your Twilio number’s “A message comes in” webhook (HTTP POST).</Notice>}
          <CopyBox label="Your incoming-message address" text={info.url} />
          <div style={{ marginTop: 10 }}><button type="button" style={buttonStyle('ghost', busy)} disabled={busy} onClick={setup}>{busy ? 'Setting up…' : info.configured ? 'Set it up again' : 'Set it up for me'}</button></div>
        </>
      ) : error ? null : <Empty>Loading…</Empty>}
    </Card>
  );
}

function OptOuts({ api, data, canSend }: { api: SmsApi; data: Loaded & { reload: () => Promise<void> }; canSend: boolean }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try { await api.addOptOut(phone.trim()); setPhone(''); await data.reload(); } catch (err: any) { setError(err.message); }
  }
  return (
    <Card title="People who must not be texted">
      <div style={{ ...note, marginBottom: 8 }}>Anyone who texts STOP lands here and is never texted again. They can come back only by texting START themselves.</div>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {data.optouts.length === 0 ? <Empty>Nobody has opted out.</Empty> : <div style={{ ...note, color: 'var(--white)' }}>{data.optouts.slice(0, 30).map((o) => o.phone).join(' · ')}</div>}
      {canSend ? (
        <form onSubmit={add} style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 420 }}>
          <input aria-label="Number to block" style={inputStyle} value={phone} placeholder="+919876543210" onChange={(e) => setPhone(e.target.value)} />
          <button type="submit" style={buttonStyle('ghost', !phone.trim())} disabled={!phone.trim()}>Add</button>
        </form>
      ) : null}
    </Card>
  );
}

// ───────────────────────────── the tab ─────────────────────────────

export function SmsWorkspace({ api, numbers, signals, canManage }: { api: SmsApi; numbers: Connection[]; signals: PageProps['data']['signals'][string]; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('inbox');
  const data = useSmsData(api);
  const connected = numbers.filter((c) => c.status === 'connected');
  const sent = named(signals, 'sms_sent');
  const received = named(signals, 'sms_received');
  const today = sent.filter((s) => time(s) >= new Date().setUTCHours(0, 0, 0, 0)).length;
  const week = sent.filter((s) => time(s) > Date.now() - 7 * 86400000).length;
  const waiting = groupThreads(data.messages, data.names).filter((t) => t.waiting).length;
  const replies = received.filter((s) => time(s) > Date.now() - 7 * 86400000).length;

  return (
    <div>
      <TileRow>
        <Tile label="Sent today" value={`${fmtNum(today)} / ${SMS_DAILY_CAP}`} tone={today >= SMS_DAILY_CAP * 0.8 ? 'warn' : undefined} />
        <Tile label="Sent, last 7 days" value={fmtNum(week)} />
        <Tile label="Replies, last 7 days" value={fmtNum(replies)} />
        <Tile label="Waiting for your answer" value={fmtNum(waiting)} tone={waiting ? 'warn' : undefined} sub={waiting ? 'Open the Inbox' : undefined} />
      </TileRow>
      <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', margin: '14px 0' }}>
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" style={tabBar(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {data.error && tab !== 'inbox' ? <Notice tone="warn">{data.error}</Notice> : null}
      {tab === 'inbox' ? <Inbox api={api} data={data} numberId={connected[0] ? connected[0].id : undefined} canSend={connected.length > 0} /> : null}
      {tab === 'sequences' ? <Sequences api={api} data={data} canManage={canManage} /> : null}
      {tab === 'rules' ? <Rules api={api} data={data} canManage={canManage} /> : null}
      {tab === 'settings' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <Card title="How the pipeline texts"><SmsSettingsPanel api={api} onSaved={data.reload} /></Card>
          {connected[0] ? <Webhook api={api} connectionId={connected[0].id} /> : null}
          <OptOuts api={api} data={data} canSend={connected.length > 0} />
        </div>
      ) : null}
      {tab === 'overview' ? (
        <div>
          <Card title="What this tells you"><InsightList items={smsInsights(signals, SMS_DAILY_CAP)} /></Card>
          <div style={{ margin: '14px 0' }}>
            <Card title="Messages sent">
              {sent.length === 0 ? <Empty>Nothing sent yet.</Empty> : sent.slice(0, 15).map((s) => (
                <div key={s.occurred_at + (s.entity && s.entity.sid)} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ ...note, fontSize: 12 }}>To {(s.entity && s.entity.to) || ''} · {fmtAgo(s.occurred_at)}</div>
                  <div style={{ color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{s.text_value}</div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SmsPage(props: PageProps) {
  const channel = CHANNELS.find((c) => c.key === 'sms')!;
  const numbers = connectionsOf(props.data, channel);
  return (
    <Shell channel={channel} props={props}>
      <div style={{ marginTop: 14 }}>
        <SmsWorkspace api={smsApi} numbers={numbers} signals={props.data.signals.sms || []} canManage={props.canManage} />
      </div>
    </Shell>
  );
}
