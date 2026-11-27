import { useEffect, useState } from 'react';
import { loadCompetitors, loadUpdates } from '../../lib/competitorsData';
import { feed, KIND_NAMES, type Update } from '../../lib/competitors/insight';
import { fieldInputStyle } from '../../components/crm/Modal';
import Feed from '../../components/competitors/Feed';
import { Needs, Page, Problem, small } from '../../components/calls/bits';

const control = { ...fieldInputStyle, width: 'auto', marginBottom: 0 };

export default function CompetitorFeed() {
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [installed, setInstalled] = useState(true);
  const [competitor, setCompetitor] = useState('');
  const [kind, setKind] = useState('');
  const [only, setOnly] = useState<'' | 'important' | 'hidden'>('');
  const [shown, setShown] = useState(50);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([loadUpdates(), loadCompetitors()])
      .then(([u, c]) => { setUpdates(u.rows); setInstalled(u.installed); setNames(Object.fromEntries(c.rows.map((r) => [r.id, r.name]))); })
      .catch((e) => { setUpdates([]); setError(e.message); });
  }, []);
  if (!installed) return <Page><Needs file="2026-11-30_h_competitor_feed.sql" /></Page>;
  const list = feed(updates || [], { competitor, kind, only });
  return (
    <Page>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select aria-label="Competitor" style={control} value={competitor} onChange={(e) => setCompetitor(e.target.value)}>
          <option value="">All competitors</option>
          {Object.entries(names).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Kind" style={control} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Everything</option>
          {Object.entries(KIND_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Show" style={control} value={only} onChange={(e) => setOnly(e.target.value as '' | 'important' | 'hidden')}>
          <option value="">Not hidden</option><option value="important">Important only</option><option value="hidden">Hidden</option>
        </select>
      </div>
      <Problem text={error} />
      {updates === null && <div style={small}>Loading…</div>}
      {updates !== null && list.length === 0 && !error && <div style={small}>Nothing here. Updates arrive from PCs running Raptor, which watch each competitor’s site and news.</div>}
      <Feed updates={list.slice(0, shown)} names={names} onChange={(u) => setUpdates((all) => (all || []).map((x) => (x.id === u.id ? u : x)))} />
      {list.length > shown && <button type="button" style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.66rem' }} onClick={() => setShown(shown + 50)}>Show more</button>}
    </Page>
  );
}
