import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { saved } from '../../lib/callsData';
import { loadCompetitors, loadUpdates } from '../../lib/competitorsData';
import { checkNew, type Competitor } from '../../lib/competitors/card';
import { feed, type Update } from '../../lib/competitors/insight';
import { useOrg } from '../../hooks/OrgContext';
import { relativeTime } from '../../lib/crmHelpers';
import { fieldInputStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import { Page, Problem, body, card, small } from '../../components/calls/bits';

export default function CompetitorList() {
  const navigate = useNavigate();
  const { can } = useOrg();
  const [rows, setRows] = useState<Competitor[] | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([loadCompetitors(), loadUpdates('', 30)]);
      setRows(c.rows);
      setUpdates(u.rows);
    } catch (e: any) {
      setRows([]);
      setError(e.message || 'Could not load the competitors.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setError('');
    setNotice('');
    const checked = checkNew(name, url, rows || []);
    if ('error' in checked) { setError(checked.error); return; }
    try {
      await saved(supabase.from('competitors').insert(checked).select('id'), 'You may not add competitors.');
      setName('');
      setUrl('');
      setNotice('Added. A PC running Raptor reads their site and writes the battle card, usually within a day.');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const shown = (rows || []).filter((r) => !!r.archived === archived);
  return (
    <Page>
      {can('create') && (
        <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Competitor name" placeholder="Competitor name" style={{ ...fieldInputStyle, flex: '1 1 160px', marginBottom: 0 }} value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Website" placeholder="Website, e.g. acme.com" style={{ ...fieldInputStyle, flex: '2 1 220px', marginBottom: 0 }} value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" style={toolPrimaryStyle} disabled={!name.trim() || !url.trim()} onClick={add}>Add competitor</button>
        </div>
      )}
      <Problem text={error} />
      {notice && <div role="status" style={{ ...small, color: 'var(--green, #22c55e)', marginBottom: 8 }}>{notice}</div>}
      {(rows || []).some((r) => r.archived) && (
        <label style={{ ...small, display: 'block', marginBottom: 8 }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
      )}
      {rows === null && <div style={small}>Loading…</div>}
      {rows !== null && shown.length === 0 && !error && <div style={small}>{archived ? 'Nothing archived.' : 'No competitors yet. Add one here, or let the PC app find them.'}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '1rem' }}>
        {shown.map((c) => {
          const recent = feed(updates, { competitor: c.id });
          const waiting = Object.keys(c.proposed || {}).length;
          return (
            <button key={c.id} type="button" onClick={() => navigate(`/competitors/${c.id}`)} style={{ ...card, textAlign: 'left', cursor: 'pointer', marginBottom: 0 }}>
              <strong style={{ ...body, fontSize: '0.9rem' }}>{c.name}</strong>
              <div style={small} dir="auto">{c.what_they_sell || 'Waiting for the PC app to read their site.'}</div>
              {c.pricing_model && c.pricing_model !== 'Unknown' && <div style={small}>Charges: {c.pricing_model}</div>}
              {recent[0] && <div style={{ ...small, color: recent[0].significance === 'high' ? 'var(--amber, #f59e0b)' : 'var(--dim)', marginTop: 6 }}>{recent[0].title} · {relativeTime(recent[0].happened_at)}</div>}
              <div style={{ ...small, marginTop: 4 }}>
                {recent.length ? `${recent.length} update${recent.length === 1 ? '' : 's'} in 30 days` : 'No updates in 30 days'}
                {waiting ? ` · ${waiting} change${waiting === 1 ? '' : 's'} to review` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </Page>
  );
}
