import { supabase } from './supabaseClient';

// Exact-match duplicate detection + merge for contacts and companies.
// v1 deliberately only groups by an exact normalized match (case/
// whitespace-insensitive email for contacts, exact name for companies) -
// no fuzzy/similarity scoring, so there are never false-positive groups
// suggesting unrelated records get merged. Reuses the same trim/lowercase
// normalization style as findOrCreateContact/findOrCreateCompany in
// crmContacts.ts, though those only prevent new dupes - this finds and
// fixes ones that already exist.
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export interface DuplicateContact { id: string; name: string; email: string | null; phone: string | null; company_id: string | null; created_at: string; }
export interface DuplicateCompany { id: string; name: string; website_url: string | null; created_at: string; }

export async function findDuplicateContacts(): Promise<DuplicateContact[][]> {
  const { data, error } = await supabase.from('contacts').select('id, name, email, phone, company_id, created_at');
  if (error) throw error;
  const groups: Record<string, DuplicateContact[]> = {};
  for (const c of (data || []) as DuplicateContact[]) {
    const key = norm(c.email);
    if (!key) continue; // no email - nothing reliable to match on
    (groups[key] = groups[key] || []).push(c);
  }
  return Object.values(groups)
    .filter((g) => g.length > 1)
    .map((rows) => rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
}

export async function findDuplicateCompanies(): Promise<DuplicateCompany[][]> {
  const { data, error } = await supabase.from('companies').select('id, name, website_url, created_at');
  if (error) throw error;
  const groups: Record<string, DuplicateCompany[]> = {};
  for (const c of (data || []) as DuplicateCompany[]) {
    const key = norm(c.name);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(c);
  }
  return Object.values(groups)
    .filter((g) => g.length > 1)
    .map((rows) => rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
}

// Same 6-table FK reassignment as ContactPanel.tsx's delete fix, except
// pointed at the surviving primary contact instead of NULL.
async function reassignContactRefs(fromId: string, toId: string) {
  await Promise.all([
    supabase.from('deals').update({ contact_id: toId }).eq('contact_id', fromId),
    supabase.from('reminders').update({ contact_id: toId }).eq('contact_id', fromId),
    supabase.from('automation_runs').update({ contact_id: toId }).eq('contact_id', fromId),
    supabase.from('interactions').update({ contact_id: toId }).eq('contact_id', fromId),
    supabase.from('calls').update({ contact_id: toId }).eq('contact_id', fromId),
    supabase.from('whatsapp_contacts').update({ crm_contact_id: toId }).eq('crm_contact_id', fromId),
    supabase.from('whatsapp_conversations').update({ crm_contact_id: toId }).eq('crm_contact_id', fromId),
  ]);
}

export async function mergeContacts(primary: DuplicateContact, duplicates: DuplicateContact[]): Promise<void> {
  let merged = { ...primary };
  for (const dup of duplicates) {
    merged = {
      ...merged,
      name: merged.name || dup.name,
      email: merged.email || dup.email,
      phone: merged.phone || dup.phone,
      company_id: merged.company_id || dup.company_id,
    };
  }
  const { error: updateError } = await supabase.from('contacts').update(merged).eq('id', primary.id);
  if (updateError) throw updateError;

  for (const dup of duplicates) {
    await reassignContactRefs(dup.id, primary.id);
    const { error } = await supabase.from('contacts').delete().eq('id', dup.id);
    if (error) throw error;
  }
}

async function reassignCompanyRefs(fromId: string, toId: string) {
  await Promise.all([
    supabase.from('deals').update({ company_id: toId }).eq('company_id', fromId),
    supabase.from('contacts').update({ company_id: toId }).eq('company_id', fromId),
  ]);
}

export async function mergeCompanies(primary: DuplicateCompany, duplicates: DuplicateCompany[]): Promise<void> {
  let merged = { ...primary };
  for (const dup of duplicates) {
    merged = { ...merged, name: merged.name || dup.name, website_url: merged.website_url || dup.website_url };
  }
  const { error: updateError } = await supabase.from('companies').update(merged).eq('id', primary.id);
  if (updateError) throw updateError;

  for (const dup of duplicates) {
    await reassignCompanyRefs(dup.id, primary.id);
    const { error } = await supabase.from('companies').delete().eq('id', dup.id);
    if (error) throw error;
  }
}
