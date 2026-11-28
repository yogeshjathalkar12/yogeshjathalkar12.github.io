import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadCall, loadTrackers, saved, type CallRow } from '../../lib/callsData';
import { allHits, linesOf, WHO_LABELS, type Tracker } from '../../lib/calls/trackers';
import { measureCards, mmss, RELIABILITY_NOTES } from '../../lib/calls/measuresView';
import { writeupSections, unverifiedNote, BY_LABELS, } from '../../lib/calls/writeupView';
import { useMemberLabels } from '../../hooks/useDirectory';
import { useOrg } from '../../hooks/OrgContext';
import { shortName } from '../../lib/team';
import { fieldInputStyle } from '../../components/crm/Modal';
import { MeasureCards, Page, Problem, SpeakerBar, Transcript, body, card, chip, heading, link, small } from '../../components/calls/bits';
import { Comments, Scores, SaveClip } from '../../components/calls/Coaching';
import { Suggestions } from '../../components/calls/Suggestions';

export default function CallDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = params.get('line');
  const { can } = useOrg();
  const [call, setCall] = useState<CallRow | null | undefined>(undefined);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([]);
  const [contactName, setContactName] = useState('');
  const [selected, setSelected] = useState<{ key: string; lines: number[] }>({ key: '', lines: [] });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const found = await loadCall(id);
      setCall(found);
      if (found?.contact_id) {
        const [contact, theirDeals] = await Promise.all([
          supabase.from('contacts').select('name').eq('id', found.contact_id).limit(1),
          supabase.from('deals').select('id, title').eq('contact_id', found.contact_id).order('created_at', { ascending: false }),
        ]);
        setContactName(contact.data?.[0]?.name || '');
        setDeals(theirDeals.data || []);
      }
    } catch (e: any) {
      setError(e.message || 'Could not load the call.');
      setCall(null);
    }
  }, [id]);

  useEffect(() => { setCall(undefined); setSelected({ key: '', lines: [] }); setError(''); setDeals([]); setContactName(''); load(); }, [load]);
  useEffect(() => { loadTrackers().then((r) => setTrackers(r.rows)).catch(() => {}); }, []);
  // opened from an answer: the line that was found is marked and brought into view
  useEffect(() => { if (wanted !== null && /^\d+$/.test(wanted)) setSelected({ key: `l:${wanted}`, lines: [Number(wanted)] }); }, [id, wanted, call?.id]);

  const lines = useMemo(() => {
    if (!call) return [];
    const timed = call.segments || [];
    return linesOf(call).map((l, i) => ({ ...l, seconds: timed[i]?.seconds }));
  }, [call]);
  const hits = useMemo(() => allHits(lines, trackers), [lines, trackers]);
  const names = useMemberLabels([call?.created_by]);

  if (call === undefined) return <Page><div style={small}>Loading…</div></Page>;
  if (call === null) return <Page><Problem text={error || 'This call does not exist, or you may not see it.'} /><button type="button" style={link} onClick={() => navigate('/calls')}>Back to calls</button></Page>;

  const pick = (key: string, found: number[]) => setSelected(selected.key === key ? { key: '', lines: [] } : { key, lines: found });
  const warning = unverifiedNote(call.writeup);

  async function linkDeal(dealId: string) {
    setError('');
    try {
      await saved(supabase.from('calls').update({ deal_id: dealId || null }).eq('id', call!.id).select('id'), 'You may not change this call.');
      setCall({ ...call!, deal_id: dealId || null });
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <Page>
      <button type="button" style={{ ...link, marginBottom: 10 }} onClick={() => navigate('/calls')}>← All calls</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--white)', fontSize: '1.2rem' }}>{call.company_name || 'Unknown'}</h2>
          <div style={small}>
            {new Date(call.started_at).toLocaleString()} · {mmss(call.duration_seconds)} · {call.created_by ? shortName(names[call.created_by]) : ''}
            {contactName ? ` · ${contactName}` : ''}{call.sentiment ? ` · ${call.sentiment}` : ''}
          </div>
        </div>
        {deals.length > 0 && call.deal_id !== undefined && (
          <label style={small}>Deal{' '}
            <select aria-label="Deal" style={{ ...fieldInputStyle, width: 'auto', marginBottom: 0 }} value={call.deal_id || ''} disabled={!can('edit')} onChange={(e) => linkDeal(e.target.value)}>
              <option value="">Not linked</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <Problem text={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div>
          <div style={card}>
            <div style={heading}>Summary</div>
            <div style={body} dir="auto">{call.summary || 'No summary yet.'}</div>
            {warning && <div role="alert" style={{ ...small, color: 'var(--amber, #f59e0b)', marginTop: 6 }}>{warning}</div>}
            {call.next_steps && <><div style={{ ...heading, marginTop: 12 }}>Next step</div><div style={body} dir="auto">{call.next_steps}</div></>}
          </div>

          <Suggestions call={call} onShow={(i) => setSelected({ key: `l:${i}`, lines: [i] })} />

          {writeupSections(call.writeup).map((section) => (
            <div key={section.key} style={card}>
              <div style={heading}>{section.title}</div>
              {section.items.map((item, i) => {
                const key = `p:${section.key}:${i}`;
                return (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                    <button type="button" aria-pressed={selected.key === key} onClick={() => pick(key, [item.line])} style={{ flex: 1, textAlign: 'left', ...chip(selected.key === key), borderRadius: 6, padding: '0.45rem 0.6rem' }}>
                      <span dir="auto" style={{ display: 'block', fontSize: '0.72rem' }}>{section.key === 'promises' && item.by ? `${BY_LABELS[item.by]}: ` : ''}{item.text}</span>
                      <span dir="auto" style={{ display: 'block', color: 'var(--dim)', fontSize: '0.62rem' }}>“{item.quote}”</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

          {measureCards(call.metrics).length > 0 && (
            <div style={card}>
              <div style={heading}>Measured</div>
              {call.metrics && RELIABILITY_NOTES[call.metrics.reliability] && <div style={{ ...small, color: 'var(--amber, #f59e0b)', marginBottom: 8 }}>{RELIABILITY_NOTES[call.metrics.reliability]}</div>}
              <MeasureCards cards={measureCards(call.metrics)} selected={selected.key} onSelect={pick} />
            </div>
          )}

          <Scores call={call} hits={hits} />
        </div>

        <div>
          <div style={card}>
            <SpeakerBar lines={lines} duration={call.duration_seconds || 0} onPick={(i) => setSelected({ key: `l:${i}`, lines: [i] })} />
            {hits.length > 0 && (
              <>
                <div style={{ ...heading, marginTop: 12 }}>Watch words heard</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {hits.map((h) => (
                    <button key={h.tracker.id} type="button" title={WHO_LABELS[h.tracker.who]} aria-pressed={selected.key === h.tracker.id} style={chip(selected.key === h.tracker.id)} onClick={() => pick(h.tracker.id, h.lines)}>
                      {h.tracker.name} × {h.count}
                    </button>
                  ))}
                </div>
              </>
            )}
            {call.recorded && <div style={{ ...small, marginTop: 10 }}>A recording of this call is kept on the PC that made it. It is not stored online.</div>}
          </div>
          {call.labels === 'guessed' && <div style={{ ...small, color: 'var(--amber, #f59e0b)', marginBottom: 6 }}>One microphone heard everyone, so who spoke is a guess.</div>}
          <Transcript lines={lines} marked={selected.lines} onLine={(i) => setSelected({ key: `l:${i}`, lines: [i] })} />
          <SaveClip call={call} lines={lines} chosen={selected.lines[0]} />
          <Comments callId={call.id} lines={lines} chosen={selected.key.startsWith('l:') ? selected.lines[0] : undefined} onShow={(i) => setSelected({ key: `l:${i}`, lines: [i] })} />
        </div>
      </div>
      <div style={{ height: 24 }} />
    </Page>
  );
}
