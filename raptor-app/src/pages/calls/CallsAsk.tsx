import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadCallsForAsk, loadRivals, loadTrackers, type CallRow } from '../../lib/callsData';
import { answerQuestion, parseQuestion, EXAMPLES, type Answer, type Rival } from '../../lib/calls/ask';
import type { Tracker } from '../../lib/calls/trackers';
import { mmss } from '../../lib/calls/measuresView';
import { fieldInputStyle, toolBtnStyle } from '../../components/crm/Modal';
import { Page, Problem, body, card, chip, small } from '../../components/calls/bits';

export default function CallsAsk() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('q') || '';
  const [typed, setTyped] = useState(asked);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [basic, setBasic] = useState(false);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTrackers().then((r) => setTrackers(r.rows)).catch(() => {});
    loadRivals().then(setRivals).catch(() => {});
  }, []);
  useEffect(() => { setTyped(asked); }, [asked]);

  useEffect(() => {
    if (!asked) { setAnswer(null); return; }
    let current = true;
    setBusy(true);
    setError('');
    (async () => {
      try {
        // the period in the question decides how far back to read; names of companies are matched after reading
        const first = parseQuestion(asked, { trackers, rivals });
        const read = await loadCallsForAsk(first.days);
        if (!current) return;
        setCalls(read.rows);
        setBasic(read.basic);
        setAnswer(answerQuestion(parseQuestion(asked, { calls: read.rows, trackers, rivals }), read.rows));
      } catch (e: any) {
        if (current) { setAnswer(null); setError(e.message || 'Could not read the calls.'); }
      } finally {
        if (current) setBusy(false);
      }
    })();
    return () => { current = false; };
  }, [asked, trackers, rivals]);

  const ask = (question: string) => { if (question.trim()) setParams({ q: question.trim() }); };

  return (
    <Page>
      <form onSubmit={(e) => { e.preventDefault(); ask(typed); }} style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input aria-label="Your question about the calls" placeholder="Ask about your calls, for example: who complained about price this month?" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ ...fieldInputStyle, flex: '1 1 260px', marginBottom: 0 }} />
        <button type="submit" style={toolBtnStyle} disabled={busy}>{busy ? 'Looking…' : 'Ask'}</button>
      </form>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {EXAMPLES.map((q) => <button key={q} type="button" style={chip(asked === q)} onClick={() => ask(q)}>{q}</button>)}
      </div>
      <Problem text={error} />
      {basic && <div style={{ ...small, marginBottom: 8 }}>Concerns, buying signals and next steps need the database update 2026-11-30_b_call_record.sql. Words are searched without it.</div>}
      {!asked && <div style={small}>Answers are lines that were actually said in your calls. Nothing is written by AI. Put a word or phrase in quotes to search for exactly that.</div>}
      {answer && !busy && (
        <div aria-live="polite">
          {answer.understood && <div style={{ ...body, marginBottom: 4 }}>{answer.understood}</div>}
          {answer.understood && <div style={{ ...small, marginBottom: 8 }}>{answer.matches.length ? `${answer.calls} of ${answer.searched} calls` : `Nothing found in ${answer.searched} call${answer.searched === 1 ? '' : 's'}.`}{calls && calls.length === 0 ? ' No calls were recorded in this period.' : ''}</div>}
          {answer.note && <div style={{ ...small, color: 'var(--amber, #f59e0b)', marginBottom: 8 }}>{answer.note}</div>}
          {answer.matches.map((m, i) => (
            <button
              key={`${m.call.id}:${m.line}:${i}`} type="button" onClick={() => navigate(`/calls/${m.call.id}${m.line === null ? '' : `?line=${m.line}`}`)}
              style={{ ...card, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8, padding: '0.6rem 0.8rem' }}
            >
              <span style={{ ...small, display: 'block' }}>{m.call.company_name || 'Unknown'} · {new Date(m.call.started_at).toLocaleDateString()}{m.at === null ? '' : ` · ${mmss(m.at)}`}</span>
              {m.text && <span dir="auto" style={{ ...body, display: 'block' }}>{m.who ? `${m.who === 'You' ? 'Our side' : m.who}: ` : ''}“{m.text}”</span>}
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
