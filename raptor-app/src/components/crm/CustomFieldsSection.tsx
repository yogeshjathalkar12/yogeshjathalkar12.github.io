import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldLabelStyle, fieldInputStyle, ghostBtnStyle } from './Modal';
import { type CustomFieldDef, type CustomFieldEntity, type CustomFieldType, loadFieldDefs, createFieldDef, deleteFieldDef } from '../../lib/customFields';

const TABLE_BY_ENTITY: Record<CustomFieldEntity, string> = { contact: 'contacts', deal: 'deals' };

interface CustomFieldsSectionProps {
  entityType: CustomFieldEntity;
  entity: any;
  onChanged: () => void;
}

// Renders this account's custom fields for one contact/deal, bound
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
    if (!confirm(`Delete the "${def.name}" field? This removes it (and its saved values) for every ${entityType}.`)) return;
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
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.6rem' }} onClick={() => setManaging((v) => !v)}>
          {managing ? 'Done' : 'Manage'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginTop: '0.4rem' }}>{error}</div>}

      {defs.map((def) => (
        <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--dim)', flex: '0 0 110px' }}>{def.name}</span>
          <input
            type={def.field_type === 'date' ? 'date' : def.field_type === 'number' ? 'number' : 'text'}
            style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
            value={entity.custom_fields?.[def.id] ?? ''}
            onChange={(e) => saveValue(def.id, e.target.value)}
            disabled={saving}
          />
          {managing && (
            <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.5rem' }} onClick={() => handleDeleteField(def)} disabled={saving}>✕</button>
          )}
        </div>
      ))}

      {managing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
          <input placeholder="e.g. Industry" style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} value={newName} onChange={(e) => setNewName(e.target.value)} />
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
