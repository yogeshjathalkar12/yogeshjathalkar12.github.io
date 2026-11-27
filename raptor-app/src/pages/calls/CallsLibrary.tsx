import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadClips, saved, type Clip } from '../../lib/callsData';
import { useOrg } from '../../hooks/OrgContext';
import { useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { mmss } from '../../lib/calls/measuresView';
import { fieldInputStyle, toolBtnStyle } from '../../components/crm/Modal';
import { Needs, Page, Problem, body, card, chip, link, small } from '../../components/calls/bits';

export default function CallsLibrary() {
  const navigate = useNavigate();
  const { isOwner, can } = useOrg();
  const manage = isOwner || can('manage_pipeline');
  const [rows, setRows] = useState<Clip[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [topic, setTopic] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => loadClips().then((r) => { setRows(r.rows); setInstalled(r.installed); }).catch((e) => { setRows([]); setError(e.message); }), []);
  useEffect(() => { load(); }, [load]);
  const names = useMemberLabels((rows || []).map((r) => r.created_by));
  if (!installed) return <Page><Needs file="2026-11-30_f_scorecards_library.sql" /></Page>;

  const topics = [...new Set((rows || []).map((r) => r.topic).filter(Boolean))].sort();
  const term = search.trim().toLowerCase();
  const shown = (rows || []).filter((r) => (!topic || r.topic === topic)
    && (!term || `${r.title} ${r.note || ''} ${r.company_name} ${r.lines.map((l) => l.text).join(' ')}`.toLowerCase().includes(term)));
  const remove = async (id: string) => {
    if (!window.confirm('Remove this entry from the library? The call itself stays.')) return;
    try { await saved(supabase.from('call_clips').delete().eq('id', id).select('id')); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <Page>
      <div style={{ ...small, marginBottom: 10 }}>Good moments from real calls, for the whole team to learn from. Add one from any call’s page.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input aria-label="Search the library" placeholder="Search" style={{ ...fieldInputStyle, width: 240, marginBottom: 0 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        {topics.map((t) => <button key={t} type="button" aria-pressed={topic === t} style={chip(topic === t)} onClick={() => setTopic(topic === t ? '' : t)}>{t}</button>)}
      </div>
      <Problem text={error} />
      {rows === null && <div style={small}>Loading…</div>}
      {rows?.length === 0 && <div style={small}>Nothing saved yet.</div>}
      {shown.map((c) => (
        <div key={c.id} style={card}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <strong style={body} dir="auto">{c.title}</strong>
              <div style={small}>{[c.topic, c.company_name, c.created_by ? `saved by ${shortName(names[c.created_by])}` : ''].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {c.call_id && <button type="button" style={link} onClick={() => navigate(`/calls/${c.call_id}`)}>Open the call</button>}
              {manage && <button type="button" style={toolBtnStyle} onClick={() => remove(c.id)}>Remove</button>}
            </div>
          </div>
          {c.note && <div style={{ ...small, marginTop: 6 }} dir="auto">{c.note}</div>}
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {c.lines.map((l, i) => (
              <div key={i} style={{ fontSize: '0.68rem', lineHeight: 1.7, color: 'var(--dim)' }}>
                {l.at !== null && l.at !== undefined && <span style={{ color: 'var(--dim2)', marginRight: 8 }}>{mmss(l.at)}</span>}
                <strong style={{ color: l.who === 'You' ? 'var(--green, #22c55e)' : 'var(--white)' }}>{l.who === 'You' ? 'Our side' : l.who}: </strong><span dir="auto">{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}
