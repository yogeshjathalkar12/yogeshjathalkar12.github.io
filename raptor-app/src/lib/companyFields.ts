// lib/companyFields.ts
// The details a company can hold besides its name and website: the columns the import fills (phone, email, address, city, industry, description).
// One list drives the New company form, the Edit form and the detail view on the web AND on the desktop (the desktop copy is generated from this
// file by scripts/port_import_desktop.mjs, so the two can never disagree about what a company holds).

export interface CompanyField {
  key: 'phone' | 'email' | 'address' | 'city' | 'industry' | 'description';
  label: string;
  placeholder: string;
  multiline?: boolean;
}

export const COMPANY_FIELDS: CompanyField[] = [
  { key: 'phone', label: 'Phone', placeholder: '+91 98765 43210' },
  { key: 'email', label: 'Email', placeholder: 'info@theircompany.com' },
  { key: 'address', label: 'Address', placeholder: 'Street, area', multiline: true },
  { key: 'city', label: 'City / region', placeholder: 'Pune' },
  { key: 'industry', label: 'Industry', placeholder: 'Logistics' },
  { key: 'description', label: 'Description', placeholder: 'What they do', multiline: true },
];

export type CompanyForm = { name: string; website_url: string } & Record<CompanyField['key'], string>;

export const blankCompanyForm = (): CompanyForm => ({ name: '', website_url: '', phone: '', email: '', address: '', city: '', industry: '', description: '' });

/** A company row (or null) as the text boxes of the form. */
export function companyToForm(company: any): CompanyForm {
  const form = blankCompanyForm();
  if (!company) return form;
  form.name = company.name || '';
  form.website_url = company.website_url || '';
  for (const f of COMPANY_FIELDS) form[f.key] = company[f.key] || '';
  return form;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form as a database row: trimmed, empty boxes become null, and a wrong email is refused in plain words. Throws Error(message). */
export function formToCompany(form: CompanyForm): Record<string, string | null> {
  const name = (form.name || '').trim();
  if (!name) throw new Error('Name is required.');
  const email = (form.email || '').trim();
  if (email && !EMAIL.test(email)) throw new Error(`"${email}" is not a valid email address.`);
  const row: Record<string, string | null> = { name, website_url: (form.website_url || '').trim() || null };
  for (const f of COMPANY_FIELDS) row[f.key] = (form[f.key] || '').trim() || null;
  return row;
}

/** The detail view: only the details that have a value, in the form's order. */
export function filledCompanyDetails(company: any): { key: string; label: string; value: string; multiline: boolean }[] {
  const out: { key: string; label: string; value: string; multiline: boolean }[] = [];
  for (const f of COMPANY_FIELDS) {
    const v = company?.[f.key];
    if (typeof v === 'string' && v.trim()) out.push({ key: f.key, label: f.label, value: v.trim(), multiline: !!f.multiline });
  }
  return out;
}

/** Custom field values typed in the form: only the ones with something in them, so an untouched field is not stored as an empty text. */
export function cleanCustomValues(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(values || {})) if (typeof v === 'string' && v.trim() !== '') out[id] = v.trim();
  return out;
}
