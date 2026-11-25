// lib/viewColumns.ts
// A person's own custom fields as table columns, next to the built-in ones.
import type { ColumnDef } from './tableView';
import type { CustomFieldDef } from './customFields';

export const customColumnId = (defId: string) => `cf:${defId}`;

/** One column per custom field (numbers sort as numbers, dates by day, dropdown fields get their choices as a filter list). */
export function customFieldColumns<R>(defs: CustomFieldDef[], getFields: (row: R) => Record<string, any> | null | undefined, rows: R[]): ColumnDef<R>[] {
  return defs.map((def) => {
    const kind = def.field_type === 'select' ? 'select' : def.field_type;
    const value = (row: R) => {
      const v = getFields(row)?.[def.id];
      return v === undefined || v === null || v === '' ? null : (kind === 'number' && !Number.isNaN(Number(v)) ? Number(v) : String(v));
    };
    let options: string[] | undefined;
    if (kind === 'select') {
      const seen = new Set<string>(def.options || []);
      for (const r of rows) { const v = getFields(r)?.[def.id]; if (typeof v === 'string' && v.trim()) seen.add(v); }
      options = [...seen];
    }
    return { id: customColumnId(def.id), label: def.name, kind, value, options };
  });
}
