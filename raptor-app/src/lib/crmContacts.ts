import { supabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// This file exists so that "who is this person" is decided in exactly one
// place. Every modal that lets someone type a name/email/company (NewContactModal,
// NewDealModal, DealDetailModal, future bulk-import hooks) should call these
// instead of inserting into `contacts` / `companies` directly. That's what
// keeps one person's data in one row no matter where it was typed.
// ---------------------------------------------------------------------------

export async function findOrCreateCompany(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing, error: findErr } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', trimmed)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from('companies')
    .insert({ name: trimmed })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

export interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  status?: string;
}

export interface ContactLookupResult {
  contact: any;
  created: boolean; // false = matched an existing person, true = genuinely new
}

export async function findOrCreateContact(input: ContactInput): Promise<ContactLookupResult> {
  const name = input.name.trim();
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  if (!name) throw new Error('Contact name is required.');

  // 1. Match by email first — the most reliable identity signal available.
  if (email) {
    const { data: byEmail, error: emailErr } = await supabase
      .from('contacts')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (emailErr) throw emailErr;

    if (byEmail) {
      // Fill in anything new we just learned without clobbering existing data.
      const patch: Record<string, any> = {};
      if (phone && !byEmail.phone) patch.phone = phone;
      if (input.companyId && !byEmail.company_id) patch.company_id = input.companyId;

      if (Object.keys(patch).length > 0) {
        const { data: updated, error: updateErr } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', byEmail.id)
          .select('*')
          .single();
        if (updateErr) throw updateErr;
        return { contact: updated, created: false };
      }
      return { contact: byEmail, created: false };
    }
  }

  // 2. No email match — fall back to name, scoped to the same company.
  //    Two "John Smith"s at two different companies are two different people;
  //    the same name with no company on either side is treated as one person.
  let nameQuery = supabase.from('contacts').select('*').ilike('name', name);
  nameQuery = input.companyId ? nameQuery.eq('company_id', input.companyId) : nameQuery.is('company_id', null);
  const { data: byName, error: nameErr } = await nameQuery.maybeSingle();
  if (nameErr) throw nameErr;
  if (byName) return { contact: byName, created: false };

  // 3. Genuinely new person.
  const { data: created, error: createErr } = await supabase
    .from('contacts')
    .insert({
      name,
      email,
      phone,
      company_id: input.companyId || null,
      status: input.status || 'cold',
    })
    .select('*')
    .single();
  if (createErr) throw createErr;
  return { contact: created, created: true };
}