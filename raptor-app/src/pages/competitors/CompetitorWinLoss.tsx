import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { summarise, type Survey } from '../../lib/buyerSurveys';
import { loadCompetitors, loadDeals } from '../../lib/competitorsData';
import { winLoss, type Deal, type Outcome } from '../../lib/competitors/insight';
import { formatCurrency } from '../../lib/crmHelpers';
import { fieldInputStyle } from '../../components/crm/Modal';
import { Needs, Page, Problem, body, card, heading, small, table, td, th } from '../../components/calls/bits';

/** What buyers themselves answered (surveys sent from a won or lost deal). Shown only once there is something. */
function BuyerAnswers({ since }: { since: string }) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  useEffect(() => {
    selectAll<Survey>(() => supabase.from('deal_surveys').select('*, deals ( title, stage )').order('created_at', { ascending: false }))
      .then((r) => { if (!r.error) setSurveys(r.data || []); }).catch(() => {});
  }, []);
  const sum = summarise(surveys.filter((s) => !since || (s.answered_at || s.created_at) >= since));
  if (!sum.sent) return null;
  return (
    <div style={{ ...card, marginTop: '1rem' }}>
      <div style={heading}>What buyers said</div>
      <div style={{ ...small, marginBottom: 8 }}>{sum.answered} of {sum.sent} surveys answered{sum.rating === null ? '' : ` · rating of our side ${sum.rating} of 5, from ${sum.ratings}`}</div>
      {sum.reasons.length > 0 && <div style={body}>Main reasons: {sum.reasons.map((r) => `${r.label} (${r.count})`).join(', ')}</div>}
      {sum.others.length > 0 && <div style={body}>Chose instead: {sum.others.map((o) => `${o.name} (${o.count})`).join(', ')}</div>}
      {sum.comments.slice(0, 20).map((s) => (
        <div key={s.id} style={{ ...small, marginTop: 8 }}><span style={{ color: 'var(--white)' }}>{s.deals?.title || 'A deal'}</span>: <span dir="auto">“{s.better}”</span></div>
      ))}
    </div>
  );
}

export default function CompetitorWinLoss() {
  const [data, setData] = useState<{ deals: Deal[]; typeOf: (s: string) => Outcome; names: string[] } | null>(null);
  const [installed, setInstalled] = useState(true);
  const [days, setDays] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([loadDeals(), loadCompetitors()])
      .then(([d, c]) => { setInstalled(d.installed); setData({ deals: d.deals, typeOf: d.typeOf, names: c.rows.map((r) => r.name) }); })
      .catch((e) => setError(e.message));
  }, []);
  if (!installed) return <Page><Needs file="2026-11-30_h_competitor_feed.sql" /></Page>;
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : '';
  // a period keeps the deals still open and those decided inside it
  const deals = (data?.deals || []).filter((d) => !since || data!.typeOf(d.stage) === 'open' || (d.closed_at || '') >= since);
  const rows = data ? winLoss(deals, data.typeOf, data.names) : [];
  return (
    <Page>
      <select aria-label="Period" style={{ ...fieldInputStyle, width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={0}>All time</option><option value={90}>Decided in the last 90 days</option><option value={365}>Decided in the last year</option>
      </select>
      <Problem text={error} />
      {!data && !error && <div style={small}>Loading…</div>}
      {data && rows.length === 0 && <div style={small}>No deal names a competitor yet. Open a deal under CRM, add the competitors in it, and record why it was won or lost.</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead><tr>{['Competitor', 'Won', 'Lost', 'Open', 'Win rate', 'Value won', 'Value lost', 'Why we lost', 'Why we won'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.competitor}>
                <td style={td}>{r.competitor}</td><td style={td}>{r.won}</td><td style={td}>{r.lost}</td><td style={td}>{r.open}</td>
                <td style={td}>{r.winRate === null ? '—' : `${r.winRate}% of ${r.won + r.lost}`}</td>
                <td style={td}>{formatCurrency(r.valueWon)}</td><td style={td}>{formatCurrency(r.valueLost)}</td>
                <td style={td}>{r.lossReasons.map(([x, n]) => `${x} (${n})`).join(', ') || '—'}</td>
                <td style={td}>{r.winReasons.map(([x, n]) => `${x} (${n})`).join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{ ...small, marginTop: 6 }}>A deal with two competitors counts for both. With only a few decided deals a win rate says little.</div>
        </div>
      )}
      <BuyerAnswers since={since} />
    </Page>
  );
}
