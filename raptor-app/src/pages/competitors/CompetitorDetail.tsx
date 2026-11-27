import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { saved } from '../../lib/callsData';
import { loadCompetitors, loadDeals, loadMentionCalls, loadUpdates } from '../../lib/competitorsData';
import { blocks, changesOf, cleanAliases, cleanPlaybook, draftOf, proposals, FIELDS, ORIGIN_LABELS, type CardField, type Competitor, type Play } from '../../lib/competitors/card';
import { feed, mentionsIn, mentionSummary, namesOf, priceHistory, winLoss, type Mention, type MentionCall, type MentionSummary, type Update, type WinLoss } from '../../lib/competitors/insight';
import { OBJECTION_NAMES, mmss } from '../../lib/calls/measuresView';
import { useMemberLabels } from '../../hooks/useDirectory';
import { useOrg } from '../../hooks/OrgContext';
import { shortName } from '../../lib/team';
import { fieldInputStyle, fieldLabelStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import Feed from '../../components/competitors/Feed';
import { Needs, Page, Problem, body, card, heading, link, small, table, td, th } from '../../components/calls/bits';

const ORIGIN_COLOURS = { confirmed: 'var(--green, #22c55e)', source: 'var(--purple)', suggestion: 'var(--amber, #f59e0b)' };
// printing gives the card alone, black on white, however long it is
const PRINT = `@media print {
  .no-print, .dash-sidebar, .dash-topbar, .dash-header, nav { display: none !important; }
  html, body, #root, #root div { background: #fff !important; color: #000 !important; overflow: visible !important; height: auto !important; max-height: none !important; }
  #root a, #root span, #root strong, #root h2 { color: #000 !important; }
}`;
const INTERVALS: [string, string][] = [['', 'Every 12 hours (usual)'], ['6', 'Every 6 hours'], ['24', 'Daily'], ['168', 'Weekly']];

export default function CompetitorDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useOrg();
  const mayEdit = can('edit');
  const [c, setC] = useState<Competitor | null | undefined>(undefined);
  const [editable, setEditable] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [feedThere, setFeedThere] = useState(true);
  const [mentions, setMentions] = useState<{ list: Mention[]; summary: MentionSummary } | null>(null);
  const [record, setRecord] = useState<WinLoss | null>(null);
  const [draft, setDraft] = useState<Record<CardField, string> | null>(null);
  const [plays, setPlays] = useState<Play[] | null>(null);
  const [aliases, setAliases] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await loadCompetitors();
      const found = all.rows.find((r) => r.id === id) || null;
      setC(found);
      setEditable(all.editable);
    } catch (e: any) { setError(e.message); setC(null); }
  }, [id]);

  useEffect(() => { setC(undefined); setDraft(null); setPlays(null); setAliases(null); setMentions(null); setRecord(null); setError(''); load(); }, [load]);
  useEffect(() => { loadUpdates(id).then((r) => { setUpdates(r.rows); setFeedThere(r.installed); }).catch((e) => setError(e.message)); }, [id]);

  // what the team's own calls and deals say: loaded once the competitor is known
  const key = c ? `${c.id}|${namesOf(c).join('|')}` : '';
  useEffect(() => {
    if (!c) return;
    let current = true;
    (async () => {
      try {
        const names = namesOf(c);
        const [found, dealData] = await Promise.all([loadMentionCalls(names), loadDeals()]);
        const list = mentionsIn(found.calls as MentionCall[], names);
        const summary = mentionSummary(list, found.calls, (dealId) => (found.stageOf[dealId] ? dealData.typeOf(found.stageOf[dealId]) : undefined));
        const rows = winLoss(dealData.deals, dealData.typeOf, [c.name]);
        if (current) {
          setMentions({ list, summary });
          setRecord(rows.find((r) => names.some((n) => n.toLowerCase() === r.competitor.toLowerCase())) || null);
        }
      } catch (e: any) { if (current) setError(e.message || 'Could not read the calls and deals.'); }
    })();
    return () => { current = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = useMemberLabels(Object.values(c?.confirmed || {}).map((v) => v.by));
  const prices = useMemo(() => priceHistory(updates), [updates]);
  const shownFeed = useMemo(() => feed(updates), [updates]);

  if (c === undefined) return <Page><div style={small}>Loading…</div></Page>;
  if (c === null) return <Page><Problem text={error || 'This competitor does not exist.'} /><button type="button" style={link} onClick={() => navigate('/competitors')}>Back to the list</button></Page>;

  const run = async (change: PromiseLike<{ data: any; error: any }>) => {
    setError('');
    try { await saved(change, 'You may not change competitors.'); await load(); return true; } catch (e: any) { setError(e.message); return false; }
  };
  const edit = (changes: Record<string, unknown>) => run(supabase.rpc('competitor_edit', { p_id: c.id, p_changes: changes }));
  const saveCard = async () => {
    if (!draft) return;
    const changes = changesOf(c, draft);
    if (!Object.keys(changes).length || await edit(changes)) setDraft(null);
  };
  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    if (await run(supabase.from('competitor_updates').insert({ competitor_id: c.id, kind: 'note', title: text.slice(0, 300), summary: text.length > 300 ? text.slice(0, 4000) : '', significance: 'medium', dedupe_key: `note:${crypto.randomUUID()}` }).select('id'))) {
      setNote('');
      loadUpdates(id).then((r) => setUpdates(r.rows));
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${c.name} for the whole team, with its feed? This cannot be undone. To stop watching it but keep everything, archive it instead.`)) return;
    if (await run(supabase.from('competitors').delete().eq('id', c.id).select('id'))) navigate('/competitors');
  };
  const watch = (c.watch || {}) as { paused?: boolean; check_interval_hours?: number | null };
  const waiting = proposals(c);

  return (
    <Page>
      <style>{PRINT}</style>
      <div className="no-print">
        <button type="button" style={{ ...link, marginBottom: 10 }} onClick={() => navigate('/competitors')}>← All competitors</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--white)', fontSize: '1.3rem' }}>{c.name}{c.archived ? ' (archived)' : ''}</h2>
          {/^https?:\/\//i.test(c.url) ? <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ ...link, textDecoration: 'none' }}>{c.url}</a> : <span style={small}>{c.url}</span>}
          {c.aliases?.length ? <div style={small}>Also called: {c.aliases.join(', ')}</div> : null}
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button type="button" style={toolBtnStyle} onClick={() => window.print()}>Print card</button>
          {editable && mayEdit && !draft && <button type="button" style={toolPrimaryStyle} onClick={() => { setError(''); setDraft(draftOf(c)); }}>Edit card</button>}
        </div>
      </div>
      <Problem text={error} />
      {!editable && <Needs file="2026-11-30_g_competitor_cards.sql" />}

      {waiting.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--amber, #f59e0b)' }} className="no-print">
          <div style={heading}>The AI would change text your team confirmed</div>
          {waiting.map((p) => (
            <div key={p.key} style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 0' }}>
              <div style={body}>{p.label}</div>
              <div style={small} dir="auto">Now: {p.current.join('; ') || '(empty)'}</div>
              <div style={small} dir="auto">Proposed: {p.proposed.join('; ') || '(empty)'}</div>
              {mayEdit && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="button" style={toolPrimaryStyle} onClick={() => run(supabase.rpc('competitor_proposal', { p_id: c.id, p_field: p.key, p_accept: true }))}>Use the new text</button>
                  <button type="button" style={toolBtnStyle} onClick={() => run(supabase.rpc('competitor_proposal', { p_id: c.id, p_field: p.key, p_accept: false }))}>Keep ours</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div style={card}>
          <div style={heading}>Edit the card</div>
          <div style={{ ...small, marginBottom: 8 }}>What you change is marked as confirmed by you and is never overwritten by a new analysis. Lists take one point per line.</div>
          {FIELDS.map((f) => (
            <label key={f.key} style={{ display: 'block' }}>
              <span style={fieldLabelStyle}>{f.label}</span>
              <textarea dir="auto" rows={f.list ? 4 : 2} style={fieldInputStyle} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={toolPrimaryStyle} onClick={saveCard}>Save card</button>
            <button type="button" style={toolBtnStyle} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={card}>
          {blocks(c).length === 0 && <div style={small}>The card is empty. A PC running Raptor writes it after reading their site.</div>}
          {blocks(c).map((b) => (
            <div key={b.key} style={{ marginBottom: 12 }}>
              <div style={heading}>{b.label}{b.confirmedBy ? ` · confirmed by ${shortName(people[b.confirmedBy])}` : ''}</div>
              {b.statements.map((s, i) => (
                <div key={i} style={{ ...body, marginBottom: 4 }}>
                  <span dir="auto">{b.list ? '• ' : ''}{s.text}</span>{' '}
                  {s.origin === 'source' && s.source ? (
                    <a href={s.source.url} target="_blank" rel="noopener noreferrer" title={`“${s.source.quote}”`} style={{ fontSize: '0.56rem', color: ORIGIN_COLOURS.source }}>{ORIGIN_LABELS.source}</a>
                  ) : s.origin === 'suggestion' ? <span style={{ fontSize: '0.56rem', color: ORIGIN_COLOURS.suggestion }}>{ORIGIN_LABELS.suggestion}</span> : null}
                </div>
              ))}
            </div>
          ))}
          {(c.playbook?.length || 0) > 0 && !plays && (
            <div>
              <div style={heading}>Our answers</div>
              {c.playbook!.map((p, i) => <div key={i} style={{ ...body, marginBottom: 6 }} dir="auto">{p.when && <span style={{ color: 'var(--dim)' }}>When: {p.when}. </span>}Say: {p.say}</div>)}
            </div>
          )}
          {c.analysed_at && <div style={small}>Last read from their site: {new Date(c.analysed_at).toLocaleDateString()}</div>}
        </div>
      )}

      {editable && mayEdit && (
        <div style={card} className="no-print">
          <div style={heading}>Our answers (shown to the caller when this competitor is named on a call)</div>
          {plays ? (
            <>
              {plays.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <input aria-label={`When ${i + 1}`} placeholder="When they say…" style={{ ...fieldInputStyle, flex: '1 1 160px', marginBottom: 0 }} value={p.when} onChange={(e) => setPlays(plays.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} />
                  <input aria-label={`Say ${i + 1}`} placeholder="…we say" style={{ ...fieldInputStyle, flex: '2 1 240px', marginBottom: 0 }} value={p.say} onChange={(e) => setPlays(plays.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)))} />
                  <button type="button" style={toolBtnStyle} aria-label={`Remove answer ${i + 1}`} onClick={() => setPlays(plays.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={toolBtnStyle} onClick={() => setPlays([...plays, { when: '', say: '' }])}>Add answer</button>
                <button type="button" style={toolPrimaryStyle} onClick={async () => { if (await edit({ playbook: cleanPlaybook(plays) })) setPlays(null); }}>Save answers</button>
                <button type="button" style={toolBtnStyle} onClick={() => setPlays(null)}>Cancel</button>
              </div>
            </>
          ) : <button type="button" style={toolBtnStyle} onClick={() => setPlays(c.playbook?.length ? c.playbook.map((p) => ({ ...p })) : [{ when: '', say: '' }])}>Edit answers</button>}
        </div>
      )}

      <div className="no-print">
        <div style={card}>
          <div style={heading}>What your calls and deals say (last 180 days)</div>
          {!mentions ? <div style={small}>Loading…</div> : (
            <>
              <div style={body}>
                Named {mentions.summary.mentions} time{mentions.summary.mentions === 1 ? '' : 's'} on {mentions.summary.calls} call{mentions.summary.calls === 1 ? '' : 's'}
                {mentions.summary.mentions ? ` (${mentions.summary.byThem} by them, ${mentions.summary.byUs} by us)` : ''}.
              </div>
              {(mentions.summary.deals.won + mentions.summary.deals.lost + mentions.summary.deals.open > 0) && (
                <div style={small}>Deals of those calls: {mentions.summary.deals.won} won, {mentions.summary.deals.lost} lost, {mentions.summary.deals.open} open.</div>
              )}
              {mentions.summary.concerns.length > 0 && <div style={small}>Concerns raised around the mention: {mentions.summary.concerns.map(([k, n]) => `${OBJECTION_NAMES[k] || k} (${n})`).join(', ')}</div>}
              {record ? (
                <div style={{ ...body, marginTop: 8 }}>
                  Deals naming them: {record.won} won, {record.lost} lost, {record.open} open{record.winRate !== null ? ` (${record.winRate}% of ${record.won + record.lost} decided)` : ''}.
                  {record.lossReasons.length > 0 && <div style={small}>Why we lost: {record.lossReasons.map(([r, n]) => `${r} (${n})`).join(', ')}</div>}
                  {record.winReasons.length > 0 && <div style={small}>Why we won: {record.winReasons.map(([r, n]) => `${r} (${n})`).join(', ')}</div>}
                </div>
              ) : <div style={small}>No deal names this competitor yet. Add it on a deal under CRM.</div>}
              {mentions.list.slice(0, 15).map((m) => (
                <div key={`${m.callId}-${m.line}`} style={{ borderTop: '1px solid var(--border)', padding: '0.4rem 0' }}>
                  <div style={body} dir="auto">“{m.quote}”</div>
                  <div style={small}>
                    {m.who === 'You' ? 'Our side' : m.who || 'Unknown'} · {m.company} · {new Date(m.at).toLocaleDateString()}{m.time !== null ? ` at ${mmss(m.time)}` : ''}
                    {m.concern ? ` · ${OBJECTION_NAMES[m.concern] || m.concern}` : ''} <button type="button" style={link} onClick={() => navigate(`/calls/${m.callId}`)}>Open the call</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {prices.length > 0 && (
          <div style={card}>
            <div style={heading}>Listed prices over time</div>
            <table style={table}><thead><tr><th style={th}>Seen</th><th style={th}>Lowest</th><th style={th}>Highest</th></tr></thead>
              <tbody>{prices.map((p, i) => <tr key={i}><td style={td}>{p.date}</td><td style={td}>{p.min}</td><td style={td}>{p.max}</td></tr>)}</tbody></table>
            <div style={small}>Numbers read off their pricing page; currency and what they buy are on the page itself.</div>
          </div>
        )}

        <div style={heading}>Updates (last 180 days)</div>
        {!feedThere ? <Needs file="2026-11-30_h_competitor_feed.sql" /> : (
          <>
            {can('create') && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <input aria-label="Something heard about them" placeholder="Heard on a call or elsewhere, e.g. they now give a free month" style={{ ...fieldInputStyle, flex: '1 1 260px', marginBottom: 0 }} value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="button" style={toolPrimaryStyle} disabled={!note.trim()} onClick={addNote}>Add note</button>
              </div>
            )}
            {shownFeed.length === 0 && <div style={small}>Nothing yet. Updates arrive from PCs running Raptor.</div>}
            <Feed updates={shownFeed.slice(0, 50)} onChange={(u) => setUpdates((all) => all.map((x) => (x.id === u.id ? u : x)))} />
          </>
        )}

        {editable && mayEdit && (
          <div style={card}>
            <div style={heading}>Watching</div>
            <label style={{ ...small, display: 'block', marginBottom: 8 }}><input type="checkbox" checked={!watch.paused} onChange={(e) => edit({ watch: { ...watch, paused: !e.target.checked } })} /> Watch their site</label>
            <label style={{ ...small, display: 'block', marginBottom: 8 }}>How often{' '}
              <select aria-label="How often" style={{ ...fieldInputStyle, width: 'auto', marginBottom: 0 }} value={String(watch.check_interval_hours || '')} onChange={(e) => edit({ watch: { ...watch, check_interval_hours: e.target.value ? Number(e.target.value) : null } })}>
                {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {aliases === null ? <button type="button" style={toolBtnStyle} onClick={() => setAliases((c.aliases || []).join(', '))}>Other names they go by</button> : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input aria-label="Other names" dir="auto" placeholder="Separate with commas, in any language" style={{ ...fieldInputStyle, flex: '1 1 240px', marginBottom: 0 }} value={aliases} onChange={(e) => setAliases(e.target.value)} />
                <button type="button" style={toolPrimaryStyle} onClick={async () => { if (await edit({ aliases: cleanAliases(aliases, c.name) })) setAliases(null); }}>Save names</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" style={toolBtnStyle} onClick={() => edit({ archived: !c.archived })}>{c.archived ? 'Bring back from the archive' : 'Archive'}</button>
              {can('delete') && <button type="button" style={toolBtnStyle} onClick={remove}>Delete</button>}
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
