import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { INBOX_SQL, INTENT_NAMES, inboxList, mailDraft, type InboxView, type ReplyNote, type TeamReply } from '../../lib/teamInbox';
import { useAuth } from '../../hooks/AuthContext';
import { useDirectory, useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { fieldInputStyle, toolBtnStyle } from '../../components/crm/Modal';

// CRM > Team inbox: replies to outreach, shared by the PC app of whoever switched it on.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem 1rem', marginBottom: 8 };
const small: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 };
const text: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--white)', lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const VIEWS: Array<[InboxView, string]> = [['open', 'Open'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['done', 'Done']];
const SHOWN = 50;

function Notes({ replyId, who }: { replyId: string; who: (id: string | null) => string }) {
  const [notes, setNotes] = useState<ReplyNote[]>([]);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => Promise.resolve(supabase.from('team_reply_notes').select('*').eq('reply_id', replyId).order('created_at', { ascending: true }))
    .then((r) => { if (r.error) setError(r.error.message); else setNotes((r.data || []) as ReplyNote[]); }), [replyId]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!typed.trim()) return;
    setError('');
    const { error: failed } = await supabase.from('team_reply_notes').insert({ reply_id: replyId, body: typed.trim().slice(0, 2000) });
    if (failed) { setError(failed.message); return; }
    setTyped('');
    load();
  };
  return (
    <div style={{ marginTop: 10 }}>
      {notes.map((n) => <div key={n.id} style={small}><span style={{ color: 'var(--white)' }}>{who(n.created_by)}</span>: <span dir="auto">{n.body}</span></div>)}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input aria-label="Add a note for the team" placeholder="Note for the team (not sent to the customer)" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ ...fieldInputStyle, marginBottom: 0 }} />
        <button type="submit" style={toolBtnStyle} disabled={!typed.trim()}>Add</button>
      </form>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}

export default function CrmInbox() {
  const { user } = useAuth();
  const { entries } = useDirectory();
  const [rows, setRows] = useState<TeamReply[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [view, setView] = useState<InboxView>('open');
  const [openId, setOpenId] = useState('');
  const [error, setError] = useState('');
  const [shown, setShown] = useState(SHOWN);

  const load = useCallback(async () => {
    // everything still open, and the most recently finished
    const [open, done] = await Promise.all([
      supabase.from('team_replies').select('*').eq('status', 'open').order('received_at', { ascending: false }).limit(1000),
      supabase.from('team_replies').select('*').eq('status', 'done').order('handled_at', { ascending: false }).limit(200),
    ]);
    const failed = open.error || done.error;
    if (failed) {
      if (isNotInstalled(failed)) setInstalled(false); else setError(failed.message);
      setRows([]);
      return;
    }
    setRows([...(open.data || []), ...(done.data || [])] as TeamReply[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const names = useMemberLabels((rows || []).flatMap((r) => [r.created_by, r.assignee_id, r.handled_by]));
  const who = (id: string | null) => (!id ? '—' : id === user?.id ? 'me' : names[id] ? shortName(names[id]) : 'a teammate');

  const change = async (reply: TeamReply, patch: Partial<Pick<TeamReply, 'status' | 'assignee_id'>>) => {
    setError('');
    const { data, error: failed } = await supabase.from('team_replies').update(patch).eq('id', reply.id).select('id');
    if (failed) setError(failed.message);
    else if (!data?.length) setError('You may not change this reply.');
    load();
  };

  if (!installed) return <div style={card}><div style={small}>The team inbox needs a database update first: run <b>{INBOX_SQL}</b> in Supabase.</div></div>;
  const list = inboxList(rows || [], view, user?.id);

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setShown(SHOWN); }} style={{ ...toolBtnStyle, borderColor: view === v ? 'var(--purple)' : 'var(--border)' }}>
            {label} {rows ? inboxList(rows, v, user?.id).length : ''}
          </button>
        ))}
        <button type="button" style={toolBtnStyle} onClick={load}>Refresh</button>
      </div>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {rows === null && <div style={small}>Loading…</div>}
      {rows !== null && list.length === 0 && (
        <div style={card}><div style={small}>Nothing here. Replies appear when someone switches on “Share replies with the team inbox” in the Raptor PC app, under Email &gt; Mailbox.</div></div>
      )}
      {list.slice(0, shown).map((r) => {
        const opened = openId === r.id;
        return (
          <div key={r.id} style={card}>
            <button type="button" aria-expanded={opened} onClick={() => setOpenId(opened ? '' : r.id)} style={{ background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ ...text, display: 'block' }}><strong>{r.from_name || r.from_email}</strong>{r.company_name ? ` · ${r.company_name}` : ''} · <span style={{ color: 'var(--purple)' }}>{INTENT_NAMES[r.intent] || 'Not sorted'}</span></span>
              <span dir="auto" style={{ ...small, display: 'block' }}>{r.subject} {r.summary ? `— ${r.summary}` : ''}</span>
              <span style={{ ...small, display: 'block' }}>{new Date(r.received_at).toLocaleString()} · from {who(r.created_by)}’s mailbox{r.assignee_id ? ` · with ${who(r.assignee_id)}` : ''}{r.status === 'done' && r.handled_by ? ` · done by ${who(r.handled_by)}` : ''}</span>
            </button>
            {opened && (
              <div style={{ marginTop: 8 }}>
                <div style={small}>{r.from_email}</div>
                <div dir="auto" style={text}>{r.body || 'No text.'}</div>
                {r.draft && <><div style={{ ...small, marginTop: 8 }}>Suggested answer (check it before sending)</div><div dir="auto" style={{ ...text, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>{r.draft}</div></>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                  <a href={mailDraft(r)} style={{ ...toolBtnStyle, textDecoration: 'none', display: 'inline-block' }}>Answer in my mail program</a>
                  <select aria-label="Assigned to" value={r.assignee_id || ''} onChange={(e) => change(r, { assignee_id: e.target.value || null })} style={{ ...fieldInputStyle, width: 'auto', marginBottom: 0 }}>
                    <option value="">Nobody</option>
                    {entries.map((e) => <option key={e.user_id} value={e.user_id}>{e.is_me ? 'Me' : shortName(e.email)}</option>)}
                  </select>
                  <button type="button" style={toolBtnStyle} onClick={() => change(r, { status: r.status === 'open' ? 'done' : 'open' })}>{r.status === 'open' ? 'Mark done' : 'Reopen'}</button>
                </div>
                <div style={{ ...small, marginTop: 4 }}>The person whose mailbox received it can also answer from the PC app, which keeps the email thread.</div>
                <Notes replyId={r.id} who={who} />
              </div>
            )}
          </div>
        );
      })}
      {list.length > shown && <button type="button" style={toolBtnStyle} onClick={() => setShown(shown + SHOWN)}>Show more</button>}
    </div>
  );
}
