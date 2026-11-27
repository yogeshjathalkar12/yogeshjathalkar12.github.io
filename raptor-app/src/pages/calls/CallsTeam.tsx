import { useEffect, useMemo, useState } from 'react';
import { loadCalls, type CallRow } from '../../lib/callsData';
import { byPerson, byWeek, concernRanking, figures, wonAgainstLost, MIN_GROUP, type Figures } from '../../lib/calls/team';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { mmss } from '../../lib/calls/measuresView';
import { fieldInputStyle } from '../../components/crm/Modal';
import { Page, Problem, card, heading, small, table, td, th } from '../../components/calls/bits';

const percent = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const one = (v: number | null) => (v === null ? '—' : (Math.round(v * 10) / 10).toString());
const COLUMNS: [string, (f: Figures) => string, (f: Figures) => string][] = [
  ['Calls', (f) => String(f.calls), () => ''],
  ['Minutes', (f) => String(f.minutes), () => ''],
  ['Talk share', (f) => percent(f.talkShare), (f) => `from ${f.talkShareFrom} calls`],
  ['Questions per call', (f) => one(f.questions), (f) => `from ${f.questionsFrom} calls`],
  ['Next step mentioned', (f) => percent(f.nextStepRate), (f) => `from ${f.nextStepFrom} calls`],
  ['Concerns acknowledged', (f) => percent(f.acknowledged), (f) => `${f.concerns} concerns`],
  ['Longest stretch', (f) => (f.longestMonologue === null ? '—' : mmss(f.longestMonologue)), () => 'average per call'],
];

export default function CallsTeam() {
  const [days, setDays] = useState(60);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [basic, setBasic] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, 'won' | 'lost' | 'open'>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setCalls(null);
    loadCalls({ days, person: '', search: '', sentiment: '', tracker: null })
      .then((r) => { if (current) { setCalls(r.rows); setBasic(r.basic); } })
      .catch((e) => { if (current) { setCalls([]); setError(e.message); } });
    return () => { current = false; };
  }, [days]);

  useEffect(() => {
    (async () => {
      try {
        const [deals, stages] = await Promise.all([selectAll<{ id: string; stage: string }>(() => supabase.from('deals').select('id, stage')), loadPipelineStages()]);
        const type = Object.fromEntries(stages.map((s) => [s.key, s.type]));
        setOutcomes(Object.fromEntries((deals.data || []).map((d) => [d.id, (type[d.stage] || (d.stage === 'won' || d.stage === 'lost' ? d.stage : 'open')) as 'won' | 'lost' | 'open'])));
      } catch { /* the comparison simply stays empty */ }
    })();
  }, []);

  const people = useMemo(() => byPerson(calls || []), [calls]);
  const names = useMemberLabels(people.map((p) => p.person));
  const weeks = useMemo(() => byWeek(calls || [], Math.min(12, Math.ceil(days / 7))), [calls, days]);
  const concerns = useMemo(() => concernRanking(calls || []), [calls]);
  const compare = useMemo(() => wonAgainstLost(calls || [], (id) => outcomes[id]), [calls, outcomes]);

  const row = (label: string, f: Figures, key: string) => (
    <tr key={key}>
      <td style={td}>{label}</td>
      {COLUMNS.map(([name, value, note]) => <td key={name} style={td} title={note(f)}>{value(f)}</td>)}
    </tr>
  );
  const tableOf = (first: string, rows: React.ReactNode) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}><thead><tr><th style={th}>{first}</th>{COLUMNS.map(([name]) => <th key={name} style={th}>{name}</th>)}</tr></thead><tbody>{rows}</tbody></table>
    </div>
  );

  return (
    <Page>
      <select aria-label="Period" style={{ ...fieldInputStyle, width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
      </select>
      <Problem text={error} />
      {calls === null && <div style={small}>Loading…</div>}
      {basic && <div style={{ ...small, marginBottom: 8 }}>The figures about talking and questions need the database update 2026-11-30_b_call_record.sql.</div>}
      {calls?.length === 0 && !error && <div style={small}>No calls in this period.</div>}
      {calls && calls.length > 0 && (
        <>
          <div style={card}><div style={heading}>By person</div>{tableOf('Person', <>{people.map((p) => row(p.person ? shortName(names[p.person]) : 'Unknown', p.figures, p.person || 'none'))}{people.length > 1 && row('Whole team', figures(calls), 'all')}</>)}
            <div style={{ ...small, marginTop: 6 }}>Point at a figure to see how many calls it comes from. You see the calls your permissions let you see.</div></div>
          <div style={card}><div style={heading}>By week (Monday dates)</div>{tableOf('Week of', weeks.map((w) => row(w.week, w.figures, w.week)))}</div>
          <div style={card}>
            <div style={heading}>Concerns heard most</div>
            {concerns.length === 0 ? <div style={small}>None recognised in this period.</div> : (
              <table style={table}><thead><tr>{['Concern', 'Times', 'Calls', 'Acknowledged first'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{concerns.map((c) => <tr key={c.kind}><td style={td}>{c.name}</td><td style={td}>{c.count}</td><td style={td}>{c.calls}</td><td style={td}>{percent(c.acknowledged)}</td></tr>)}</tbody></table>
            )}
          </div>
          <div style={card}>
            <div style={heading}>Calls on deals won against deals lost</div>
            {compare.enough ? (
              <>
                {tableOf('Deals', <>{row('Won', compare.won, 'won')}{row('Lost', compare.lost, 'lost')}</>)}
                <div style={{ ...small, marginTop: 6 }}>A difference here shows what happened, not what caused it.</div>
              </>
            ) : (
              <div style={small}>Not enough yet: {compare.wonCalls} calls on won deals and {compare.lostCalls} on lost deals. It takes {MIN_GROUP} of each before a comparison means anything.</div>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
