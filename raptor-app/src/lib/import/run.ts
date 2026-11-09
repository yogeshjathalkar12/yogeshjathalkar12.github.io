// lib/import/run.ts
// Executes a Plan (see plan.ts) against the database, as ONE import batch:
//   begin (crm_import_begin) -> custom fields -> companies -> contacts -> deals -> updates of existing records -> finish.
// Every record it creates carries the batch tag (so Undo can find it); every change to an existing record goes through
// crm_import_apply_update (fills empty fields only and writes the old values down). The batch is ALWAYS finished, also when
// something fails or the person presses Stop, so it shows up in the import history and can be undone.
// The database client is passed in (default: the app's own) so the whole thing is tested with a fake.

import type { Entity, Existing, Plan, UpdatePlan } from './plan.ts';
import { buildProspectRow } from './prospects.ts';

export interface DbClient {
  rpc: (fn: string, args?: Record<string, any>) => PromiseLike<{ data: any; error: any }>;
  from: (table: string) => any;
}

export interface RunProgress { phase: string; done: number; total: number }
export interface RunFailure { table: string; name: string; message: string }
export interface RunResult {
  batchId: string;
  created: { companies: number; contacts: number; deals: number; prospects: number };
  updated: { companies: number; contacts: number };
  fieldsFilled: number;
  customFieldsCreated: number;
  failed: RunFailure[];
  stopped: boolean;
}

export interface RunOptions {
  source: string;
  fileName: string;
  onProgress?: (p: RunProgress) => void;
  shouldStop?: () => boolean;
  chunkSize?: number;
  concurrency?: number;
}

// loaded on first use, so the logic above can be tested without the app's real database settings
async function appClient(): Promise<DbClient> { return (await import('../supabaseClient.ts')).supabase as unknown as DbClient; }

const msg = (e: any) => String(e?.message || e?.details || e || 'Unknown error');
const clean = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// ------------------------------------------------------------------ loading what is already there

async function pageAll(client: DbClient, table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadExisting(db?: DbClient): Promise<Existing> {
  const client = db ?? await appClient();
  const [companies, contacts, deals, defs, dossiers] = await Promise.all([
    pageAll(client, 'companies', 'id,name,website_url,phone,email,address,city,industry,description,custom_fields,created_at'),
    pageAll(client, 'contacts', 'id,name,email,phone,company_id,first_name,last_name,linkedin_url,custom_fields'),
    pageAll(client, 'deals', 'id,title,company_id'),
    pageAll(client, 'custom_field_defs', 'id,entity_type,name'),
    pageAll(client, 'prospect_dossiers', 'id,entity_name,company_key,company_id').catch(() => [] as any[]),   // unreadable: a duplicate is then refused by the database, never created
  ]);
  const map = (e: Entity) => new Map<string, string>(defs.filter((d) => d.entity_type === e).map((d) => [String(d.name).toLowerCase(), d.id as string]));
  return { companies, contacts, deals, dossiers, defs: { company: map('company'), contact: map('contact'), deal: map('deal') } };
}

// ------------------------------------------------------------------ running

export async function runImport(plan: Plan, existing: Existing, opts: RunOptions, db?: DbClient): Promise<RunResult> {
  const client = db ?? await appClient();
  const chunk = opts.chunkSize ?? 200;
  const conc = Math.max(1, opts.concurrency ?? 6);
  const progress = (phase: string, done: number, total: number) => opts.onProgress?.({ phase, done, total });
  const failed: RunFailure[] = [];

  // 1. custom fields first: if they cannot be created, nothing has been written yet and the person is told why
  const defIds: Record<Entity, Map<string, string>> = { company: new Map(existing.defs.company), contact: new Map(existing.defs.contact), deal: new Map(existing.defs.deal) };
  let customCreated = 0;
  for (const [i, f] of plan.newCustomFields.entries()) {
    progress('Preparing custom fields', i, plan.newCustomFields.length);
    const lower = f.name.toLowerCase();
    if (defIds[f.entity].has(lower)) continue;
    const { data, error } = await client.from('custom_field_defs').insert({ entity_type: f.entity, name: f.name, field_type: 'text', sort_order: defIds[f.entity].size + i }).select('id').single();
    if (error) {
      if (error.code === '23505') {
        const again = await client.from('custom_field_defs').select('id').eq('entity_type', f.entity).ilike('name', f.name).maybeSingle();
        if (again.data?.id) { defIds[f.entity].set(lower, again.data.id); continue; }
      }
      throw new Error(error.code === '42501'
        ? `You may not create custom fields, which this import needs ("${f.name}"). Ask an admin, or set those columns to "Don't import". Nothing was imported.`
        : `Could not create the custom field "${f.name}": ${msg(error)}. Nothing was imported.`);
    }
    defIds[f.entity].set(lower, data.id);
    customCreated++;
  }
  const customJson = (entity: Entity, custom: Record<string, string>) => {
    const o: Record<string, string> = {};
    for (const [name, v] of Object.entries(custom)) { const id = defIds[entity].get(name.toLowerCase()); if (id) o[id] = v; }
    return o;
  };

  // 2. the batch
  const begin = await client.rpc('crm_import_begin', { p_source: opts.source, p_file: opts.fileName });
  if (begin.error) throw new Error(`Could not start the import: ${msg(begin.error)}`);
  const batchId = String(begin.data);

  const created = { companies: 0, contacts: 0, deals: 0, prospects: 0 };
  const updated = { companies: 0, contacts: 0 };
  let fieldsFilled = 0;
  let stopped = false;
  const badCompanies = new Set<string>();
  const badContacts = new Set<string>();

  const insertAll = async (table: string, label: string, rows: { id: string; name: string; row: Record<string, any> }[], onFail: (id: string) => void, ignoreDuplicates = false): Promise<number> => {
    let ok = 0;
    for (let i = 0; i < rows.length; i += chunk) {
      if (opts.shouldStop?.()) { stopped = true; break; }
      progress(label, i, rows.length);
      const part = rows.slice(i, i + chunk);
      const { error } = await client.from(table).insert(part.map((r) => r.row));
      if (!error) { ok += part.length; continue; }
      // the table or column is not there (the database update for this step was never installed): say so once, do not repeat it for every row
      if (['PGRST204', 'PGRST205', '42703', '42P01'].includes(error.code)) {
        failed.push({ table, name: '', message: `The database update for ${table === 'prospect_dossiers' ? 'adding prospects' : table} is not installed yet (${msg(error)}). ${rows.length - i} row${rows.length - i === 1 ? ' was' : 's were'} not added.` });
        break;
      }
      // one bad row must not sink 199 good ones: try the rows of this chunk one by one
      for (const r of part) {
        const one = await client.from(table).insert(r.row);
        if (one.error && ignoreDuplicates && one.error.code === '23505') continue;          // somebody added that company to the prospect book in the meantime: fine
        if (one.error) { failed.push({ table, name: r.name, message: msg(one.error) }); onFail(r.id); } else ok++;
      }
    }
    progress(label, rows.length, rows.length);
    return ok;
  };

  try {
    // 3. creates, parents first
    created.companies = await insertAll('companies', 'Adding companies', plan.companies.create.map((c) => ({
      id: c.id, name: c.rec.name,
      row: clean({ id: c.id, name: c.rec.name, website_url: c.rec.website_url, phone: c.rec.phone, email: c.rec.email, address: c.rec.address, city: c.rec.city, industry: c.rec.industry, description: c.rec.description, custom_fields: customJson('company', c.rec.custom), import_batch_id: batchId }),
    })), (id) => badCompanies.add(id));

    if (!stopped) {
      created.contacts = await insertAll('contacts', 'Adding contacts', plan.contacts.create.map((c) => ({
        id: c.id, name: c.rec.name,
        row: clean({ id: c.id, name: c.rec.name, first_name: c.rec.first_name, last_name: c.rec.last_name, email: c.rec.email, phone: c.rec.phone, linkedin_url: c.rec.linkedin_url, status: c.rec.status || 'cold', company_id: c.companyId && !badCompanies.has(c.companyId) ? c.companyId : undefined, custom_fields: customJson('contact', c.rec.custom), import_batch_id: batchId }),
      })), (id) => badContacts.add(id));
    }
    if (!stopped) {
      created.deals = await insertAll('deals', 'Adding deals', plan.deals.create.map((d) => ({
        id: d.id, name: d.rec.title,
        row: clean({ id: d.id, title: d.rec.title, value: d.rec.value, stage: d.rec.stage, meeting_at: d.rec.meeting_at, company_id: d.companyId && !badCompanies.has(d.companyId) ? d.companyId : undefined, contact_id: d.contactId && !badContacts.has(d.contactId) ? d.contactId : undefined, custom_fields: customJson('deal', d.rec.custom), import_batch_id: batchId }),
      })), () => undefined);
    }

    if (!stopped && plan.prospects.create.length) {
      const label = opts.fileName || 'a file';
      const now = new Date().toISOString();
      created.prospects = await insertAll('prospect_dossiers', 'Adding prospects', plan.prospects.create.map((p) => ({
        id: p.id, name: p.entityName,
        row: { id: p.id, ...buildProspectRow(p.rec, p.contacts, p.companyId && !badCompanies.has(p.companyId) ? p.companyId : null, label, now), import_batch_id: batchId },
      })), () => undefined, true);
    }

    // 4. existing records: fill empty fields (logged, so Undo can put them back)
    if (!stopped) {
      const todo: UpdatePlan[] = [...plan.companies.update, ...plan.contacts.update];
      let next = 0, done = 0;
      const worker = async () => {
        for (;;) {
          if (opts.shouldStop?.()) { stopped = true; return; }
          const u = todo[next++];
          if (!u) return;
          const patch: Record<string, string> = {};
          const entity: Entity = u.table === 'companies' ? 'company' : 'contact';
          for (const [k, v] of Object.entries(u.patch)) {
            if (k.startsWith('cfnew:')) { const name = k.split(':').slice(2).join(':'); const id = defIds[(k.split(':')[1] as Entity) || entity].get(name.toLowerCase()); if (id) patch[`cf:${id}`] = v; }
            else if (k === 'company_id' && badCompanies.has(v)) continue;
            else patch[k] = v;
          }
          if (Object.keys(patch).length) {
            const { data, error } = await client.rpc('crm_import_apply_update', { p_batch: batchId, p_table: u.table, p_id: u.id, p_patch: patch, p_only_empty: true });
            if (error) failed.push({ table: u.table, name: u.name, message: msg(error) });
            else {
              const n = Array.isArray(data?.applied) ? data.applied.length : 0;
              if (n) { fieldsFilled += n; if (u.table === 'companies') updated.companies++; else updated.contacts++; }
            }
          }
          progress('Filling empty fields on existing records', ++done, todo.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, worker));
    }
  } catch (e) {
    failed.push({ table: 'import', name: '', message: msg(e) });
    stopped = true;
  } finally {
    // 5. always close the batch: a half-finished import is still an import the person can see and undo
    const counts = { created, updated, fields_filled: fieldsFilled, failed: failed.length, stopped, custom_fields_created: customCreated, rows_read: plan.counts.rowsRead, rows_skipped: plan.counts.skipped };
    const fin = await client.rpc('crm_import_finish', { p_batch: batchId, p_counts: counts });
    if (fin.error) failed.push({ table: 'import', name: '', message: `The import could not be closed: ${msg(fin.error)} (it is still listed and can be undone)` });
  }
  return { batchId, created, updated, fieldsFilled, customFieldsCreated: customCreated, failed, stopped };
}

// ------------------------------------------------------------------ history and undo

export interface ImportRow {
  id: string; source_name: string | null; file_name: string | null; status: 'open' | 'committed' | 'undone' | 'undone_partial';
  counts: any; started_at: string; committed_at: string | null; undone_at: string | null; undo_report: any;
}

export async function listImports(db?: DbClient): Promise<ImportRow[]> {
  const client = db ?? await appClient();
  const { data, error } = await client.from('crm_imports').select('id,source_name,file_name,status,counts,started_at,committed_at,undone_at,undo_report').order('started_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as ImportRow[];
}

export async function previewUndo(batchId: string, db?: DbClient): Promise<any> {
  const client = db ?? await appClient();
  const { data, error } = await client.rpc('crm_import_undo_preview', { p_batch: batchId });
  if (error) throw new Error(msg(error));
  return data;
}

/** Undo works in rounds (a request is cut off after a few seconds); this asks again until the database says it is done. */
export async function runUndo(batchId: string, includeEdited: boolean, onRound?: (r: any) => void, db?: DbClient): Promise<any> {
  const client = db ?? await appClient();
  for (let round = 0; round < 200; round++) {
    const { data, error } = await client.rpc('crm_import_undo', { p_batch: batchId, p_include_edited: includeEdited, p_limit: 1500 });
    if (error) throw new Error(msg(error));
    onRound?.(data);
    if (data?.done) return data;
  }
  throw new Error('Undo is taking too many rounds. Press Undo again to continue; nothing is lost.');
}
