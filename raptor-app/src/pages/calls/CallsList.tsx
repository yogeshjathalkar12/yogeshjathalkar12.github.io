import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadCalls, loadTrackers, type CallRow } from '../../lib/callsData';
import type { Tracker } from '../../lib/calls/trackers';
import { mmss } from '../../lib/calls/measuresView';
import { useDirectory, useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { fieldInputStyle } from '../../components/crm/Modal';
import { Page, Problem, small, table, td, th } from '../../components/calls/bits';

const PERIODS: [number, string][] = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year'], [0, 'All time']];
const SHOWN = 100;
const control = { ...fieldInputStyle, width: 'auto', marginBottom: 0 };

export default function CallsList() {
  const navigate = useNavigate();
  const { entries } = useDirectory();
  const [days, setDays] = useState(30);
  const [person, setPerson] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [trackerId, setTrackerId] = useState('');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [basic, setBasic] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(SHOWN);

  useEffect(() => { loadTrackers().then((r) => setTrackers(r.rows)).catch(() => {}); }, []);
  // the search waits until the person stops typing
  useEffect(() => { const t = setTimeout(() => setSearch(typed), 350); return () => clearTimeout(t); }, [typed]);

  const tracker = trackers.find((t) => t.id === trackerId) || null;
  useEffect(() => {
    let current = true;
    setRows(null);
    setError('');
    setShown(SHOWN);
    loadCalls({ days, person, search, sentiment, tracker })
      .then((r) => { if (current) { setRows(r.rows); setBasic(r.basic); } })
      .catch((e) => { if (current) { setRows([]); setError(e.message || 'Could not load the calls.'); } });
    return () => { current = false; };
  }, [days, person, search, sentiment, trackerId, trackers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemberLabels((rows || []).map((r) => r.created_by));
  const who = (id: string | null) => (id ? shortName(names[id]) : '—');

  return (
    <Page>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input aria-label="Search calls" placeholder="Search company, summary or words said" style={{ ...control, flex: '1 1 220px' }} value={typed} onChange={(e) => setTyped(e.target.value)} />
        <select aria-label="Period" style={control} value={days} onChange={(e) => setDays(Number(e.target.value))}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Person" style={control} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {entries.map((e) => <option key={e.user_id} value={e.user_id}>{e.is_me ? 'Me' : shortName(e.email)}</option>)}
        </select>
        <select aria-label="Mood" style={control} value={sentiment} onChange={(e) => setSentiment(e.target.value)}>
          <option value="">Any mood</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option>
        </select>
        {trackers.length > 0 && (
          <select aria-label="Watch word" style={control} value={trackerId} onChange={(e) => setTrackerId(e.target.value)}>
            <option value="">Any words</option>
            {trackers.map((t) => <option key={t.id} value={t.id}>Mentions: {t.name}</option>)}
          </select>
        )}
      </div>
      <Problem text={error} />
      {basic && <div style={{ ...small, marginBottom: 8 }}>Measures appear here after the database update 2026-11-30_b_call_record.sql.</div>}
      {rows === null && <div style={small}>Loading…</div>}
      {rows?.length === 0 && !error && (
        <div style={small}>No calls match. Calls are made in the Raptor PC app (Calls &gt; Live Copilot) and appear here when they end.</div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ ...small, marginBottom: 6 }}>{rows.length} call{rows.length === 1 ? '' : 's'}</div>
          <table style={table}>
            <thead><tr>{['When', 'Company', 'Who', 'Length', 'Talk share', 'Questions', 'Next step', 'Summary'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, shown).map((r) => (
                <tr key={r.id} onClick={() => navigate(`/calls/${r.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(r.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td style={td}><a href={`#/calls/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--white)' }}>{r.company_name || 'Unknown'}</a></td>
                  <td style={td}>{who(r.created_by)}</td>
                  <td style={td}>{mmss(r.duration_seconds)}</td>
                  <td style={td}>{r.metrics?.talk?.rep_share != null ? `${Math.round(r.metrics.talk.rep_share * 100)}%` : '—'}</td>
                  <td style={td}>{r.metrics?.questions ? r.metrics.questions.count : '—'}</td>
                  <td style={td}>{r.metrics?.next_step ? (r.metrics.next_step.mentioned ? 'Yes' : 'No') : '—'}</td>
                  <td style={{ ...td, color: 'var(--dim)', maxWidth: 380 }} dir="auto">{(r.summary || '').slice(0, 160)}{(r.summary || '').length > 160 ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown && <button type="button" style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.66rem', marginTop: 8 }} onClick={() => setShown(shown + SHOWN)}>Show more</button>}
        </div>
      )}
    </Page>
  );
}
