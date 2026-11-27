// Which competitors a deal is up against and, once it is won or lost, why. These feed the win and loss figures under Competitors.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { REASONS } from '../../lib/competitors/insight';
import { fieldInputStyle, fieldLabelStyle } from './Modal';

export interface Competition { competitors: string[]; reason: string; typed: string }

export const competitionOf = (deal: { competitors?: string[] | null; outcome_reason?: string | null }): Competition =>
  ({ competitors: deal.competitors || [], reason: deal.outcome_reason || '', typed: '' });

/** A name still in the box when the person saves counts too. Repeats (whatever the capitals) are left out. */
export function addNames(list: string[], typed: string): string[] {
  const out = [...list];
  for (const raw of typed.split(',')) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 20);
}

/** What to write on the deal. The reason is written only on a won or lost deal; on an open one an old reason is left as it was. */
export function competitionRow(value: Competition, stageType: string | undefined) {
  const closed = stageType === 'won' || stageType === 'lost';
  return { competitors: addNames(value.competitors, value.typed), ...(closed ? { outcome_reason: value.reason.trim().slice(0, 300) || null } : {}) };
}

export default function DealCompetitionFields({ value, onChange, stageType }: { value: Competition; onChange: (v: Competition) => void; stageType?: string }) {
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    Promise.resolve(supabase.from('competitors').select('name').order('name'))
      .then(({ data }) => setKnown((data || []).map((c: any) => c.name))).catch(() => {});
  }, []);
  const add = () => onChange({ ...value, competitors: addNames(value.competitors, value.typed), typed: '' });
  const closed = stageType === 'won' || stageType === 'lost';

  return (
    <>
      <label style={fieldLabelStyle}>Competitors in this deal</label>
      {value.competitors.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {value.competitors.map((name) => (
            <button key={name} type="button" aria-label={`Remove ${name}`} onClick={() => onChange({ ...value, competitors: value.competitors.filter((n) => n !== name) })}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: 14, padding: '0.2rem 0.6rem', fontSize: '0.62rem', cursor: 'pointer' }}>
              {name} ×
            </button>
          ))}
        </div>
      )}
      <input
        aria-label="Add a competitor" list="deal-competitors" placeholder="Type a name and press Enter" style={fieldInputStyle} value={value.typed}
        onChange={(e) => onChange({ ...value, typed: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={() => { if (value.typed.trim()) add(); }}
      />
      <datalist id="deal-competitors">{known.filter((k) => !value.competitors.includes(k)).map((k) => <option key={k} value={k} />)}</datalist>
      {closed && (
        <>
          <label style={fieldLabelStyle}>Why did we {stageType === 'won' ? 'win' : 'lose'}?</label>
          <input aria-label="Why was it won or lost" list="deal-reasons" placeholder="Choose or type a reason" style={fieldInputStyle} value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} />
          <datalist id="deal-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </>
      )}
    </>
  );
}
