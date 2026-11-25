import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldLabelStyle, fieldInputStyle, ghostBtnStyle } from './Modal';
import { type CustomFieldDef, type CustomFieldEntity, type CustomFieldType, loadFieldDefs, createFieldDef, deleteFieldDef } from '../../lib/customFields';
import { useOrg } from '../../hooks/OrgContext';

const TABLE_BY_ENTITY: Record<CustomFieldEntity, string> = { contact: 'contacts', deal: 'deals', company: 'companies' };

// One box for one custom field. It keeps what is being typed in the box and saves only when the person leaves the box (or presses Enter, or picks from a
// dropdown), instead of saving on every key press: before, each letter was a database write and the box was locked while it saved, which made typing
// a sentence into a text field jerky. `live` (the New forms) reports every change instead, because nothing is saved until the form's own Save.
export function FieldInput({ def, value, disabled, onCommit, live = false }: {
  def: CustomFieldDef; value: unknown; disabled?: boolean; onCommit: (v: string) => void; live?: boolean;
}) {
  const stored = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(stored);
  useEffect(() => { setDraft(stored); }, [stored]);
  const style = { ...fieldInputStyle, marginBottom: 0, flex: 1 } as const;

  if (def.field_type === 'select' && def.options && def.options.length) {
    const options = draft && !def.options.includes(draft) ? [draft, ...def.options] : def.options;     // a value typed or imported earlier is still shown
    return (
      <select style={style} value={draft} disabled={disabled} onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type={def.field_type === 'date' ? 'date' : def.field_type === 'number' ? 'number' : 'text'}
      style={style}
      value={draft}
      disabled={disabled}
      onChange={(e) => { setDraft(e.target.value); if (live) onCommit(e.target.value); }}
      onBlur={() => { if (!live && draft !== stored) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

// The boxes of a New form: this account's custom fields for one kind of record, filled in before the record exists. Nothing is saved here; the form
// that contains it stores the values together with the record.
export function CustomFieldsInputs({ entityType, values, onChange }: { entityType: CustomFieldEntity; values: Record<string, string>; onChange: (id: string, value: string) => void }) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const { can } = useOrg();
  useEffect(() => {
    loadFieldDefs(entityType).then(setDefs).catch((e) => console.error('Failed to load custom fields:', e));
  }, [entityType]);
  if (defs.length === 0 || !can('create')) return null;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <label style={fieldLabelStyle}>Custom fields</label>
      {defs.map((def) => (
        <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--dim)', flex: '0 0 110px' }}>{def.name}</span>
          <FieldInput def={def} value={values[def.id]} live onCommit={(v) => onChange(def.id, v)} />
        </div>
      ))}
    </div>
  );
}

interface CustomFieldsSectionProps {
  entityType: CustomFieldEntity;
  entity: any;
  onChanged: () => void;
}

// Renders this account's custom fields for one contact/deal/company, bound
// directly to its `custom_fields` jsonb column. A "Manage" toggle reveals
// add/delete-field controls - same role as the desktop app's
// CustomFieldsSection.js, kept in sync by hand across the two codebases.
export default function CustomFieldsSection({ entityType, entity, onChanged }: CustomFieldsSectionProps) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const { can } = useOrg();
  const canManageFields = can('manage_pipeline');
  const canEditValues = can('edit');

  useEffect(() => {
    loadFieldDefs(entityType).then(setDefs).catch((e) => console.error('Failed to load custom fields:', e)).finally(() => setLoading(false));
  }, [entityType]);

  const refreshDefs = async () => setDefs(await loadFieldDefs(entityType));

  const saveValue = async (defId: string, value: string) => {
    setSaving(true);
    setError(null);
    try {
      const nextFields = { ...(entity.custom_fields || {}), [defId]: value };
      const { error: saveError } = await supabase.from(TABLE_BY_ENTITY[entityType]).update({ custom_fields: nextFields }).eq('id', entity.id);
      if (saveError) throw saveError;
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Could not save that field.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = async () => {
    setSaving(true);
    setError(null);
    try {
      await createFieldDef(entityType, newName, newType, null);
      setNewName('');
      setNewType('text');
      await refreshDefs();
    } catch (e: any) {
      setError(e.message || 'Could not add that field.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (def: CustomFieldDef) => {
    if (!confirm(`Delete the "${def.name}" field? It disappears from every ${entityType}. The values already saved are no longer shown (they are not erased from the record).`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteFieldDef(def.id);
      await refreshDefs();
    } catch (e: any) {
      setError(e.message || 'Could not delete that field.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  if (defs.length === 0 && !managing) {
    if (!canManageFields) return null;
    return (
      <div style={{ marginTop: '0.8rem' }}>
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.55rem', padding: '0.3rem 0.7rem' }} onClick={() => setManaging(true)}>
          + Add custom field
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>Custom fields</label>
        {canManageFields && (
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.6rem' }} onClick={() => setManaging((v) => !v)}>
            {managing ? 'Done' : 'Manage'}
          </button>
        )}
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginTop: '0.4rem' }}>{error}</div>}

      {defs.map((def) => (
        <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--dim)', flex: '0 0 110px' }}>{def.name}</span>
          <FieldInput def={def} value={entity.custom_fields?.[def.id]} disabled={saving || !canEditValues} onCommit={(v) => saveValue(def.id, v)} />
          {managing && (
            <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.5rem' }} onClick={() => handleDeleteField(def)} disabled={saving}>✕</button>
          )}
        </div>
      ))}

      {managing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
          <input placeholder="e.g. Sales cycle" style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select style={{ ...fieldInputStyle, marginBottom: 0, width: 100 }} value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldType)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} onClick={handleAddField} disabled={saving || !newName.trim()}>Add</button>
        </div>
      )}
    </div>
  );
}
