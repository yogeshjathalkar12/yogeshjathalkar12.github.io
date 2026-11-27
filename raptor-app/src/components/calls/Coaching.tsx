// The coaching parts of a call's page: comments, scorecards and saving a moment to the team's library.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadComments, loadScorecards, loadScores, saved, type CallRow, type Comment, type Score } from '../../lib/callsData';
import { clipLines, scoreOf, startingAnswers, type Answer, type Scorecard } from '../../lib/calls/scoring';
import type { Hit } from '../../lib/calls/trackers';
import { mmss } from '../../lib/calls/measuresView';
import { useAuth } from '../../hooks/AuthContext';
import { useOrg } from '../../hooks/OrgContext';
import { useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { relativeTime } from '../../lib/crmHelpers';
import { fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from '../crm/Modal';
import { Problem, body, card, heading, link, small, type ShownLine } from './bits';

export function Comments({ callId, lines, chosen, onShow }: { callId: string; lines: ShownLine[]; chosen?: number; onShow: (line: number) => void }) {
  const { user } = useAuth();
  const { isOwner } = useOrg();
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [text, setText] = useState('');
  const [onLine, setOnLine] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => loadComments(callId).then((r) => { setRows(r.rows); setInstalled(r.installed); }).catch((e) => setError(e.message)), [callId]);
  useEffect(() => { setRows(null); setText(''); setError(''); load(); }, [load]);
  const names = useMemberLabels((rows || []).map((r) => r.created_by));
  if (!installed) return null;
  const line = onLine && chosen !== undefined ? chosen : null;

  const add = async () => {
    setError('');
    try {
      await saved(supabase.from('call_comments').insert({ call_id: callId, body: text.trim(), line }).select('id'), 'You may not comment on this call.');
      setText('');
      load();
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this comment?')) return;
    try { await saved(supabase.from('call_comments').delete().eq('id', id).select('id')); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div style={{ ...card, marginTop: '1rem' }}>
      <div style={heading}>Comments</div>
      {(rows || []).map((c) => (
        <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 0' }}>
          <div style={body} dir="auto">{c.body}</div>
          <div style={{ ...small, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{c.created_by ? shortName(names[c.created_by]) : ''} · {relativeTime(c.created_at)}</span>
            {c.line !== null && lines[c.line] && <button type="button" style={link} onClick={() => onShow(c.line as number)}>on the line at {mmss(lines[c.line].at) || `#${c.line + 1}`}</button>}
            {(c.created_by === user?.id || isOwner) && <button type="button" style={link} onClick={() => remove(c.id)}>Delete</button>}
          </div>
        </div>
      ))}
      <textarea aria-label="New comment" placeholder="A note for the team or the caller" style={{ ...fieldInputStyle, minHeight: 48, marginBottom: 6 }} value={text} onChange={(e) => setText(e.target.value)} />
      {chosen !== undefined && (
        <label style={{ ...small, display: 'block', marginBottom: 6 }}><input type="checkbox" checked={onLine} onChange={(e) => setOnLine(e.target.checked)} /> About the line at {mmss(lines[chosen]?.at) || `#${chosen + 1}`}</label>
      )}
      <button type="button" style={toolPrimaryStyle} disabled={!text.trim()} onClick={add}>Comment</button>
      <Problem text={error} />
    </div>
  );
}

const CHOICES: [Answer, string][] = [['yes', 'Yes'], ['no', 'No'], ['na', '—']];

export function Scores({ call, hits }: { call: CallRow; hits: Hit[] }) {
  const { user } = useAuth();
  const [cards, setCards] = useState<Scorecard[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [installed, setInstalled] = useState(true);
  const [editing, setEditing] = useState<{ card: Scorecard; answers: Record<string, Answer>; note: string; id?: string } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([loadScorecards(), loadScores(call.id)]);
      setCards(c.rows);
      setScores(s.rows);
      setInstalled(c.installed && s.installed);
    } catch (e: any) { setError(e.message); }
  }, [call.id]);
  useEffect(() => { setEditing(null); load(); }, [load]);
  const names = useMemberLabels(scores.map((s) => s.created_by));
  if (!installed || (!cards.length && !scores.length)) return null;

  const start = (sc: Scorecard) => {
    const mine = scores.find((s) => s.scorecard_id === sc.id && s.created_by === user?.id);
    setError('');
    setEditing({ card: sc, answers: mine ? mine.answers : startingAnswers(sc, call.metrics, hits), note: mine?.note || '', id: mine?.id });
  };
  const save = async () => {
    if (!editing) return;
    const row = { answers: editing.answers, score: scoreOf(editing.card, editing.answers), note: editing.note.trim() || null };
    try {
      await saved(editing.id
        ? supabase.from('call_scores').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editing.id).select('id')
        : supabase.from('call_scores').insert({ ...row, call_id: call.id, scorecard_id: editing.card.id }).select('id'), 'You may not score this call.');
      setEditing(null);
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div style={card}>
      <div style={heading}>Scorecards</div>
      {scores.map((s) => (
        <div key={s.id} style={{ ...body, borderTop: '1px solid var(--border)', padding: '0.4rem 0' }}>
          <strong>{s.score === null ? 'No score' : `${s.score}/100`}</strong> {cards.find((c) => c.id === s.scorecard_id)?.name || ''}
          <span style={small}> by {s.created_by ? shortName(names[s.created_by]) : ''}</span>
          {s.note && <div style={small} dir="auto">{s.note}</div>}
        </div>
      ))}
      {!editing && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {cards.filter((c) => c.is_active).map((c) => <button key={c.id} type="button" style={toolBtnStyle} onClick={() => start(c)}>Score: {c.name}</button>)}
        </div>
      )}
      {editing && (
        <div style={{ marginTop: 8 }}>
          {editing.card.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
              <span style={body}>{item.label}{item.kind === 'auto' && <span style={small}> (filled from the call)</span>}</span>
              <select aria-label={item.label} style={{ ...fieldInputStyle, width: 80, marginBottom: 0 }} value={editing.answers[item.id] || 'na'} onChange={(e) => setEditing({ ...editing, answers: { ...editing.answers, [item.id]: e.target.value as Answer } })}>
                {CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <textarea aria-label="Coaching note" placeholder="Coaching note" style={{ ...fieldInputStyle, minHeight: 44 }} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={toolPrimaryStyle} onClick={save}>Save score ({scoreOf(editing.card, editing.answers) ?? '—'})</button>
            <button type="button" style={toolBtnStyle} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <Problem text={error} />
    </div>
  );
}

export function SaveClip({ call, lines, chosen }: { call: CallRow; lines: ShownLine[]; chosen?: number }) {
  const { isOwner, can } = useOrg();
  const [form, setForm] = useState<{ from: number; to: number; title: string; topic: string; note: string } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { setForm(null); setDone(false); setError(''); }, [call.id]);
  if (!(isOwner || can('manage_pipeline')) || !lines.length) return null;

  if (!form) {
    const from = chosen ?? 0;
    return (
      <div style={{ marginTop: 8 }}>
        <button type="button" style={link} onClick={() => { setDone(false); setForm({ from, to: Math.min(lines.length - 1, from + 5), title: '', topic: '', note: '' }); }}>Save a moment to the team library</button>
        {done && <span role="status" style={{ ...small, color: 'var(--green, #22c55e)', marginLeft: 8 }}>Saved to the library.</span>}
      </div>
    );
  }
  const picked = clipLines(lines, form.from, form.to);
  const option = (i: number) => <option key={i} value={i}>{mmss(lines[i].at) || `#${i + 1}`} {lines[i].text.slice(0, 50)}</option>;
  const save = async () => {
    if (!form.title.trim()) { setError('Give it a title.'); return; }
    try {
      await saved(supabase.from('call_clips').insert({
        call_id: call.id, title: form.title.trim(), topic: form.topic.trim(), note: form.note.trim() || null, company_name: call.company_name, lines: picked,
      }).select('id'), 'Only the owner or a member who manages the pipeline may add to the library.');
      setForm(null);
      setDone(true);
    } catch (e: any) { setError(e.message); }
  };
  const select = { ...fieldInputStyle, marginBottom: 6 };
  return (
    <div style={{ ...card, marginTop: 8 }}>
      <div style={heading}>New library entry</div>
      <div style={{ ...small, marginBottom: 8 }}>Everyone in your organization will be able to read these lines, even people who cannot see this contact. Remove anything private by picking fewer lines.</div>
      <select aria-label="From line" style={select} value={form.from} onChange={(e) => setForm({ ...form, from: Number(e.target.value) })}>{lines.map((_, i) => option(i))}</select>
      <select aria-label="To line" style={select} value={form.to} onChange={(e) => setForm({ ...form, to: Number(e.target.value) })}>{lines.map((_, i) => option(i))}</select>
      <div style={{ ...small, marginBottom: 6 }}>{picked.length} line{picked.length === 1 ? '' : 's'} will be copied.</div>
      <input aria-label="Title" placeholder="Title, e.g. Handling the price question" style={select} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input aria-label="Topic" placeholder="Topic, e.g. Price" maxLength={40} style={select} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
      <textarea aria-label="Why it is good" placeholder="Why it is worth reading" style={{ ...select, minHeight: 44 }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={toolPrimaryStyle} onClick={save}>Save to library</button>
        <button type="button" style={toolBtnStyle} onClick={() => setForm(null)}>Cancel</button>
      </div>
      <Problem text={error} />
    </div>
  );
}
