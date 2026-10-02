import { supabase } from './supabaseClient';

// Naive substring search (ilike) across the 4 entity types, run in
// parallel. Fine at the data volumes a single account's own CRM has today;
// if that stops being true, add a pg_trgm index rather than rewriting this.
export interface GlobalSearchResults {
  contacts: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; title: string; value: number }>;
  calls: Array<{ id: string; company_name: string; summary: string | null; created_at: string }>;
}

export async function searchAll(query: string): Promise<GlobalSearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { contacts: [], companies: [], deals: [], calls: [] };
  const q = `%${trimmed}%`;

  const [contacts, companies, deals, calls] = await Promise.all([
    supabase.from('contacts').select('id, name, email, phone').or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`).limit(5),
    supabase.from('companies').select('id, name').ilike('name', q).limit(5),
    supabase.from('deals').select('id, title, value').ilike('title', q).limit(5),
    supabase.from('calls').select('id, company_name, summary, created_at').or(`company_name.ilike.${q},summary.ilike.${q},transcript.ilike.${q}`).limit(5),
  ]);

  return {
    contacts: contacts.data || [],
    companies: companies.data || [],
    deals: deals.data || [],
    calls: calls.data || [],
  };
}
