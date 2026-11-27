import { useEffect, useId, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useColumn } from '../../hooks/useColumn';
import { useOrg } from '../../hooks/OrgContext';
import { cleanTag, withTag, withoutTag } from '../../lib/tags';
import type { RecordKind } from '../../lib/bulk';
import { fieldInputStyle, fieldLabelStyle, toolBtnStyle } from './Modal';

// The tags of one record. Each change is saved at once. Shows nothing until 2026-11-28_h_tags.sql has been run.

export const chipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--purple)', borderRadius: 999, padding: '0.1rem 0.55rem', fontSize: '0.6rem', color: 'var(--white)', overflowWrap: 'anywhere' };

export default function TagsEditor({ table, recordId, tags, suggestions = [], onChanged }: {
  table: RecordKind;
  recordId: string;
  tags: string[] | null | undefined;
  suggestions?: string[];
  onChanged: () => void;
}) {
  const installed = useColumn(table, 'tags');
  const { can } = useOrg();
  const listId = useId();
  const [shown, setShown] = useState<string[]>(tags || []);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const given = (tags || []).join('\u0000');
  useEffect(() => { setShown(tags || []); setText(''); setError(''); }, [recordId, given]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!installed) return null;

  async function save(next: string[]) {
    const before = shown;
    setShown(next);
    setError('');
    const { data, error: failed } = await supabase.from(table).update({ tags: next }).eq('id', recordId).select('id');
    if (failed || !(data || []).length) {
      setShown(before);
      setError(failed?.message || 'You cannot change this record.');
      return;
    }
    onChanged();
  }

  function add() {
    if (!cleanTag(text)) return;
    try {
      const next = withTag(shown, text);
      setText('');
      if (next !== shown) save(next);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div style={{ margin: '0.8rem 0' }}>
      <div style={fieldLabelStyle}>Tags</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {shown.map((t) => (
          <span key={t} style={chipStyle}>
            {t}
            {can('edit') && <button type="button" aria-label={`Remove the tag ${t}`} onClick={() => save(withoutTag(shown, t))} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}>✕</button>}
          </span>
        ))}
        {shown.length === 0 && !can('edit') && <span style={{ fontSize: '0.6rem', color: 'var(--dim2)' }}>None</span>}
        {can('edit') && (
          <>
            <input list={listId} aria-label="New tag" placeholder="Add a tag" value={text} maxLength={40}
              style={{ ...fieldInputStyle, width: 150, marginBottom: 0, padding: '0.3rem 0.5rem' }}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <datalist id={listId}>{suggestions.filter((s) => !shown.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
            <button type="button" style={toolBtnStyle} disabled={!cleanTag(text)} onClick={add}>Add</button>
          </>
        )}
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
