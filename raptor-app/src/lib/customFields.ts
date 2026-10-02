import { supabase } from './supabaseClient';

// Account-defined extra fields on contacts/deals - every vertical tracks
// something the fixed schema doesn't. Definitions live in one shared table
// (db/migrations/2026-10-02_custom_fields.sql, Raptor B2B repo) read by
// both this app and the desktop app; values live in each entity's own
// `custom_fields` jsonb column, keyed by this def's `id` (not its name) so
// renaming a field never orphans already-saved values - same key-vs-label
// split as pipelineStages.ts's stage.key vs stage.label.
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';
export type CustomFieldEntity = 'contact' | 'deal';

export interface CustomFieldDef {
  id: string;
  owner_id: string;
  entity_type: CustomFieldEntity;
  name: string;
  field_type: CustomFieldType;
  options: string[] | null;
  sort_order: number;
  created_at: string;
}

export async function loadFieldDefs(entityType: CustomFieldEntity): Promise<CustomFieldDef[]> {
  const { data, error } = await supabase
    .from('custom_field_defs')
    .select('*')
    .eq('entity_type', entityType)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as CustomFieldDef[];
}

export async function createFieldDef(entityType: CustomFieldEntity, name: string, fieldType: CustomFieldType, options: string[] | null): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Field name is required.');
  const { data, error } = await supabase
    .from('custom_field_defs')
    .select('sort_order')
    .eq('entity_type', entityType)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  const nextOrder = (data && data[0] ? data[0].sort_order : -1) + 1;
  const { error: insertError } = await supabase.from('custom_field_defs').insert({
    entity_type: entityType,
    name: trimmed,
    field_type: fieldType,
    options: fieldType === 'select' ? options : null,
    sort_order: nextOrder,
  });
  if (insertError) {
    if (insertError.code === '23505') throw new Error(`A field named "${trimmed}" already exists.`);
    throw insertError;
  }
}

export async function deleteFieldDef(id: string): Promise<void> {
  const { error } = await supabase.from('custom_field_defs').delete().eq('id', id);
  if (error) throw error;
}
