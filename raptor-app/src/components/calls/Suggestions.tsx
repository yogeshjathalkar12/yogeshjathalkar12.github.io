import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadRivals, saved, type CallRow } from '../../lib/callsData';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { isNotInstalled } from '../../lib/dbMissing';
import { suggestionsFor, type Rival, type SuggestDeal, type SuggestStage, type SuggestTask, type Suggestion } from '../../lib/callSuggestions';
import { useOrg } from '../../hooks/OrgContext';
import { fieldInputStyle, toolBtnStyle } from '../crm/Modal';
import { Problem, card, heading, link, small } from './bits';

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Suggested updates" on a call: each change waits for a person to press its button. */
export function Suggestions({ call, onShow }: { call: CallRow; onShow: (line: number) => void }) {
  const { can } = useOrg();
  const [deal, setDeal] = useState<SuggestDeal | null>(null);
  const [stages, setStages] = useState<SuggestStage[]>([]);
  const [tasks, setTasks] = useState<SuggestTask[]>([]);
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [found, theStages, theTasks, theRivals] = await Promise.all([
      call.deal_id ? supabase.from('deals').select('*').eq('id', call.deal_id).limit(1) : Promise.resolve({ data: [] as any[], error: null }),
      loadPipelineStages().catch(() => []),
      call.deal_id || call.contact_id
        ? supabase.from('tasks').select('title, deal_id, contact_id').or([call.deal_id ? `deal_id.eq.${call.deal_id}` : '', call.contact_id ? `contact_id.eq.${call.contact_id}` : ''].filter(Boolean).join(','))
        : Promise.resolve({ data: [] as any[], error: null }),
      loadRivals().catch(() => []),
    ]);
    const row = found.data?.[0];
    // competitors on a deal need their own database update; without it that suggestion is not made
    setDeal(row ? { id: row.id, stage: row.stage, competitors: row.competitors ?? null } : null);
    setStages(theStages as SuggestStage[]);
    setTasks(theTasks.error && !isNotInstalled(theTasks.error) ? [] : (theTasks.data || []));
    setRivals(row && 'competitors' in row ? theRivals : []);
    setReady(true);
  }, [call.deal_id, call.contact_id]);

  useEffect(() => { setReady(false); setDone({}); setError(''); load().catch((e) => setError(e.message || 'Could not load the suggestions.')); }, [load, call.id]);

  if (!ready) return error ? <Problem text={error} /> : null;
  const list = suggestionsFor(call, { deal, stages, tasks, rivals }).filter((s) => (s.kind === 'task' ? can('create') : can('edit')));
  if (!list.length) return null;

  async function approve(s: Suggestion) {
    setBusy(s.key);
    setError('');
    try {
      if (s.kind === 'task') {
        const date = dates[s.key] ?? tomorrow();
        await saved(supabase.from('tasks').insert({ title: s.title, notes: s.notes, contact_id: call.contact_id || null, deal_id: call.deal_id || null, due_at: date ? new Date(`${date}T10:00:00`).toISOString() : null }).select('id'), 'You may not add tasks.');
        setDone((d) => ({ ...d, [s.key]: 'Task added' }));
      } else {
        const change = s.kind === 'stage' ? { stage: s.stage } : { competitors: s.competitors };
        await saved(supabase.from('deals').update(change).eq('id', deal!.id).select('id'), 'You may not change this deal.');
        setDone((d) => ({ ...d, [s.key]: s.kind === 'stage' ? 'Deal moved' : 'Recorded' }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div style={card}>
      <div style={heading}>Suggested updates</div>
      <div style={{ ...small, marginBottom: 8 }}>Nothing is changed until you press a button.{call.deal_id ? '' : ' Link this call to a deal to get suggestions for the deal too.'}</div>
      <Problem text={error} />
      {list.map((s) => (
        <div key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div dir="auto" style={{ fontSize: '0.72rem', color: 'var(--white)' }}>{s.label}</div>
            <div style={small}>{s.why}{s.line === null ? '' : <> <button type="button" style={link} onClick={() => onShow(s.line as number)}>Show the words</button></>}</div>
          </div>
          {done[s.key] ? <span role="status" style={{ ...small, color: 'var(--green, #22c55e)' }}>{done[s.key]}</span> : (
            <>
              {s.kind === 'task' && <input aria-label={`Due date for: ${s.label}`} type="date" value={dates[s.key] ?? tomorrow()} onChange={(e) => setDates((d) => ({ ...d, [s.key]: e.target.value }))} style={{ ...fieldInputStyle, width: 'auto', marginBottom: 0 }} />}
              <button type="button" style={toolBtnStyle} disabled={busy === s.key} onClick={() => approve(s)}>{s.kind === 'task' ? 'Add' : 'Do it'}</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
