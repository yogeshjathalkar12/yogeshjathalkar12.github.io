// lib/importSchema.ts
// Defines what a "correct format" means for each importable table, and validates
// one raw CSV row against it. This is the layer that decides valid vs invalid —
// everything else (mapping UI, preview) is just presenting its output.

export interface ImportFieldSchema {
  key: string;              // the DB column this maps to
  label: string;             // shown to the user in the mapping/preview UI
  required?: boolean;
  type?: 'text' | 'email' | 'number' | 'date' | 'enum';
  enumValues?: string[];     // lowercase allowed values, only used when type === 'enum'
}

export interface RowValidation {
  cleaned: Record<string, any>;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRow(
  raw: Record<string, string>,
  mapping: Record<string, string>, // schema key -> CSV header the user chose
  schema: ImportFieldSchema[]
): RowValidation {
  const cleaned: Record<string, any> = {};
  const errors: string[] = [];

  for (const field of schema) {
    const csvHeader = mapping[field.key];
    const value = csvHeader ? (raw[csvHeader] ?? '').trim() : '';

    if (field.required && !value) {
      errors.push(`${field.label} is required`);
      continue;
    }
    if (!value) {
      cleaned[field.key] = null;
      continue;
    }

    switch (field.type) {
      case 'email':
        if (!EMAIL_RE.test(value)) errors.push(`${field.label}: "${value}" is not a valid email`);
        cleaned[field.key] = value;
        break;
      case 'number': {
        const n = Number(value);
        if (Number.isNaN(n)) errors.push(`${field.label}: "${value}" is not a number`);
        cleaned[field.key] = n;
        break;
      }
      case 'date': {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) errors.push(`${field.label}: "${value}" is not a valid date`);
        cleaned[field.key] = value;
        break;
      }
      case 'enum':
        if (field.enumValues && !field.enumValues.includes(value.toLowerCase())) {
          errors.push(`${field.label}: "${value}" must be one of ${field.enumValues.join(', ')}`);
        }
        cleaned[field.key] = value.toLowerCase();
        break;
      default:
        cleaned[field.key] = value;
    }
  }

  return { cleaned, errors };
}

// ---- Ready-made schemas for your existing CRM tables ----

export const CONTACTS_IMPORT_SCHEMA: ImportFieldSchema[] = [
  { key: 'name', label: 'Name', required: true, type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'status', label: 'Status', type: 'enum', enumValues: ['cold', 'active', 'hot'] },
];

export const DEALS_IMPORT_SCHEMA: ImportFieldSchema[] = [
  { key: 'title', label: 'Deal Title', required: true, type: 'text' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'stage', label: 'Stage', type: 'enum', enumValues: ['lead', 'meeting', 'negotiation', 'won', 'lost'] },
];

export const CAMPAIGNS_IMPORT_SCHEMA: ImportFieldSchema[] = [
  { key: 'name', label: 'Campaign Name', required: true, type: 'text' },
  { key: 'product_name', label: 'Product', type: 'text' },
  { key: 'product_price', label: 'Price', type: 'number' },
  { key: 'target_count', label: 'Target Count', type: 'number' },
  { key: 'start_date', label: 'Start Date', type: 'date' },
  { key: 'end_date', label: 'End Date', type: 'date' },
];