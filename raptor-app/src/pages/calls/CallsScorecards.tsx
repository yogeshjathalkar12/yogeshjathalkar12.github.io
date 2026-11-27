import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadScorecards, loadTrackers, saved } from '../../lib/callsData';
import { checkScorecard, RULES, type Item, type RuleType, type Scorecard } from '../../lib/calls/scoring';
import type { Tracker } from '../../lib/calls/trackers';
import { useOrg } from '../../hooks/OrgContext';
import { fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import { Needs, Page, Problem, body, card, heading, small } from '../../components/calls/bits';

const REFUSED = 'Only the owner or a member who manages the pipeline may change scorecards.';
const newId = () => Math.random().toString(36).slice(2, 10);
const auto = (type: RuleType, label: string): Item => ({ id: newId(), label, kind: 'auto', rule: { type, value: RULES[type].usual } });
const manual = (label: string): Item => ({ id: newId(), label, kind: 'manual' });
const starter = () => ({
  id: '', name: 'Discovery call',
  items: [auto('talk_share', 'Listened more than talked'), auto('questions', 'Asked enough questions'), auto('next_step', 'Agreed what happens next'),
    auto('acknowledged', 'Acknowledged concerns before answering'), manual('Understood the problem before pitching'), manual('Asked who decides')],
});
const control = { ...fieldInputStyle, marginBottom: 0, width: 'auto' };

export default function CallsScorecards() {
  const { isOwner, can } = useOrg();
  const manage = isOwner || can('manage_pipeline');
  const [cards, setCards] = useState<Scorecard[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [form, setForm] = useState<{ id: string; name: string; items: Item[] } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => loadScorecards().then((r) => { setCards(r.rows); setInstalled(r.installed); }).catch((e) => { setCards([]); setError(e.message); }), []);
  useEffect(() => { load(); loadTrackers().then((r) => setTrackers(r.rows)).catch(() => {}); }, [load]);

  const run = async (change: PromiseLike<{ data: any; error: any }>) => {
    setError('');
    try { await saved(change, REFUSED); await load(); return true; } catch (e: any) { setError(e.message); return false; }
  };
  const save = async () => {
    if (!form) return;
    const checked = checkScorecard(form, cards || [], form.id);
    if ('error' in checked) { setError(checked.error); return; }
    if (await run(form.id ? supabase.from('call_scorecards').update({ ...checked, updated_at: new Date().toISOString() }).eq('id', form.id).select('id') : supabase.from('call_scorecards').insert(checked).select('id'))) setForm(null);
  };
  const set = (index: number, patch: Partial<Item>) => setForm((f) => f && { ...f, items: f.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });

  if (!installed) return <Page><Needs file="2026-11-30_f_scorecards_library.sql" /></Page>;

  return (
    <Page>
      <div style={{ ...small, marginBottom: 12 }}>A checklist for a good call. Open a call and press Score: the items counted from the call are filled in, the others you answer.</div>
      <Problem text={error} />
      {cards === null && <div style={small}>Loading…</div>}
      {cards?.map((c) => (
        <div key={c.id} style={card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ ...body, flex: 1 }}>{c.name}{c.is_active ? '' : ' (off)'}</strong>
            {manage && <button type="button" style={toolBtnStyle} onClick={() => run(supabase.from('call_scorecards').update({ is_active: !c.is_active }).eq('id', c.id).select('id'))}>{c.is_active ? 'Switch off' : 'Switch on'}</button>}
            {manage && <button type="button" style={toolBtnStyle} onClick={() => { setError(''); setForm({ id: c.id, name: c.name, items: c.items.map((i) => ({ ...i })) }); }}>Edit</button>}
            {manage && <button type="button" style={toolBtnStyle} onClick={() => { if (window.confirm(`Delete "${c.name}" and every score given with it?`)) run(supabase.from('call_scorecards').delete().eq('id', c.id).select('id')); }}>Delete</button>}
          </div>
          <ul style={{ ...small, margin: '8px 0 0', paddingLeft: '1.1rem' }}>{c.items.map((i) => <li key={i.id}>{i.label}{i.kind === 'auto' ? ' (from the call)' : ''}</li>)}</ul>
        </div>
      ))}
      {cards?.length === 0 && <div style={{ ...small, marginBottom: 10 }}>No scorecards yet.</div>}
      {manage && !form && cards !== null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={toolPrimaryStyle} onClick={() => { setError(''); setForm({ id: '', name: '', items: [manual('')] }); }}>New scorecard</button>
          {!cards.some((c) => c.name === 'Discovery call') && <button type="button" style={toolBtnStyle} onClick={() => { setError(''); setForm(starter()); }}>Start from “Discovery call”</button>}
        </div>
      )}
      {form && (
        <div style={card}>
          <div style={heading}>{form.id ? 'Change scorecard' : 'New scorecard'}</div>
          <input aria-label="Scorecard name" placeholder="Name" style={fieldInputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {form.items.map((item, i) => {
            const rule = item.kind === 'auto' ? item.rule?.type || '' : '';
            return (
              <div key={item.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input aria-label={`Item ${i + 1}`} placeholder="What a good call does" style={{ ...control, flex: '1 1 220px' }} value={item.label} onChange={(e) => set(i, { label: e.target.value })} />
                <select aria-label={`How item ${i + 1} is checked`} style={control} value={rule} onChange={(e) => {
                  const type = e.target.value as RuleType | '';
                  set(i, type ? { kind: 'auto', rule: { type, value: RULES[type].usual } } : { kind: 'manual', rule: undefined });
                }}>
                  <option value="">A person decides</option>
                  {(Object.keys(RULES) as RuleType[]).filter((t) => t !== 'watch_word' || trackers.length).map((t) => <option key={t} value={t}>{RULES[t].label}</option>)}
                </select>
                {rule && RULES[rule].needs === 'value' && (
                  <label style={small}><input aria-label={`Number for item ${i + 1}`} type="number" min={1} style={{ ...control, width: 80 }} value={item.rule?.value ?? ''} onChange={(e) => set(i, { rule: { type: rule, value: Number(e.target.value) } })} /> {RULES[rule].unit}</label>
                )}
                {rule === 'watch_word' && (
                  <select aria-label={`Watch word for item ${i + 1}`} style={control} value={item.rule?.tracker || ''} onChange={(e) => set(i, { rule: { type: rule, tracker: e.target.value } })}>
                    <option value="">Choose…</option>
                    {trackers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button type="button" style={toolBtnStyle} aria-label={`Remove item ${i + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={toolBtnStyle} disabled={form.items.length >= 30} onClick={() => setForm({ ...form, items: [...form.items, manual('')] })}>Add item</button>
            <button type="button" style={toolPrimaryStyle} onClick={save}>Save scorecard</button>
            <button type="button" style={toolBtnStyle} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </Page>
  );
}
