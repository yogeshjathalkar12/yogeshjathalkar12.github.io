import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import { useColumn } from '../../hooks/useColumn';
import { shortName } from '../../lib/team';
import { type RecordKind, bulkMessage, bulkUpdate, moveToBin } from '../../lib/bulk';
import { fieldInputStyle, toolBtnStyle } from './Modal';

// What can be done to the records ticked in a list: change a value, hand them to someone, delete them.

export interface BulkChoice {
  label: string;                                   // "Set status"
  options: [value: string, label: string][];
  patch: (value: string) => Record<string, unknown>;
}

const NOUN: Record<RecordKind, string> = { contacts: 'contact', companies: 'company', deals: 'deal' };

export default function BulkBar({ table, ids, choices = [], assign = false, byRules = false, onDone }: {
  table: RecordKind;
  ids: string[];
  choices?: BulkChoice[];
  assign?: boolean;
  /** contacts only: let the assignment rules decide */
  byRules?: boolean;
  onDone: (message: string) => void;
}) {
  const { can } = useOrg();
  const { entries } = useDirectory();
  const hasBin = useColumn(table, 'deleted_at');
  const hasTags = useColumn(table, 'tags');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const people = entries.filter((e) => e.can_assign);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError('');
    try {
      onDone(await work());
    } catch (e: any) {
      setError(e.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const change = (patch: Record<string, unknown>) => run(async () => bulkMessage(await bulkUpdate(supabase, table, ids, patch), NOUN[table], 'changed'));

  function tag(add: boolean) {
    const value = window.prompt(add ? 'Tag to add to the selected records:' : 'Tag to remove from the selected records:')?.trim();
    if (!value) return;
    run(async () => {
      const { data, error: failed } = await supabase.rpc('crm_tag', { p_table: table, p_ids: ids, p_tag: value, p_add: add });
      if (failed) throw new Error(failed.message);
      const n = Number(data) || 0;
      return `${n} of ${ids.length} selected: tag "${value}" ${add ? 'added' : 'removed'}.`;
    });
  }

  function remove() {
    const many = `${ids.length} ${ids.length === 1 ? NOUN[table] : table}`;
    const warning = hasBin ? `Delete ${many}? They stay in the recycle bin for 30 days.` : `Delete ${many}? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    run(async () => {
      const binned = await moveToBin(supabase, table, ids);
      if (binned) return bulkMessage(binned, NOUN[table], 'moved to the recycle bin');
      // no bin yet: delete directly (the database refuses a record that something still points at)
      let gone = 0;
      for (const id of ids) {
        const { data, error: failed } = await supabase.from(table).delete().eq('id', id).select('id');
        if (!failed) gone += (data || []).length;
      }
      return gone === ids.length ? `${gone} deleted.` : `${gone} of ${ids.length} deleted. The others are still used by other records or are not yours to delete.`;
    });
  }

  const select = { ...fieldInputStyle, width: 'auto', marginBottom: 0, padding: '0.4rem 0.5rem' } as const;
  return (
    <div role="region" aria-label="Selected records" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', border: '1px solid var(--purple)', borderRadius: 6, padding: '0.6rem 0.8rem', marginBottom: '0.7rem', fontSize: '0.68rem' }}>
      <strong>{ids.length} selected</strong>
      {can('edit') && choices.map((c) => (
        <select key={c.label} style={select} aria-label={c.label} disabled={busy} value="" onChange={(e) => {
          const value = e.target.value;
          if (value && window.confirm(`${c.label}: ${c.options.find(([v]) => v === value)?.[1]} for ${ids.length} selected?`)) change(c.patch(value));
        }}>
          <option value="">{c.label}…</option>
          {c.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ))}
      {can('edit') && assign && people.length > 0 && (
        <select style={select} aria-label="Assign to" disabled={busy} value="" onChange={(e) => {
          const value = e.target.value;
          const who = people.find((p) => p.user_id === value);
          if (value && window.confirm(`Assign ${ids.length} selected to ${shortName(who?.email || '')}?`)) change({ assignee_id: value });
        }}>
          <option value="">Assign to…</option>
          {people.map((p) => <option key={p.user_id} value={p.user_id}>{shortName(p.email)}</option>)}
        </select>
      )}
      {byRules && <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => {
        if (!window.confirm(`Assign ${ids.length} selected by your assignment rules? Contacts no rule matches stay as they are.`)) return;
        run(async () => {
          const { data, error: failed } = await supabase.rpc('crm_assign_by_rules', { p_ids: ids });
          if (failed) throw new Error(failed.message);
          return `${Number(data) || 0} of ${ids.length} selected were given to someone new.`;
        });
      }}>Assign by rules</button>}
      {can('edit') && hasTags && <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => tag(true)}>Add tag</button>}
      {can('edit') && hasTags && <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => tag(false)}>Remove tag</button>}
      {can('delete') && <button type="button" style={{ ...toolBtnStyle, color: 'var(--red)' }} disabled={busy} onClick={remove}>Delete</button>}
      {busy && <span style={{ color: 'var(--dim)' }}>Working…</span>}
      {error && <span style={{ color: 'var(--red)' }}>{error}</span>}
    </div>
  );
}
