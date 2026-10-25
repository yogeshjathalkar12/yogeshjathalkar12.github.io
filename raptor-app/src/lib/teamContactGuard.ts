// One company, one team: before a text, WhatsApp message or email goes to someone at a company, check whether a teammate already reached out to it (or owns it)
// and ask first. The same rule the desktop app applies (raptor/prospects/team_actions.py: overlap / record). The shared prospect book lives in
// prospect_dossiers.team (db/migrations/2026-10-22_team_prospect_book.sql): {"owner": {user_id, email, ...}, "contacted": [{by, channel, at}, ...]}.
//
// This only ADVISES: it never blocks work because it could not check (offline, the database update not installed, a company that is not in the prospect
// book yet, a company written differently from the book's name). The company is found by its name, case-insensitively; the desktop matches on the web
// address as well, so a company written another way there may not be found here, and then nothing is asked.

export const CONTACT_WINDOW_DAYS = 30;

export type Channel = 'email' | 'whatsapp' | 'sms';

interface Team {
  owner?: { user_id?: string; email?: string } | null;
  contacted?: Array<{ by?: string; channel?: string; at?: string }> | null;
}

// The part of the Supabase client used here (so the module can be tested with a small fake).
interface SupabaseLike {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data?: any; error?: any }>;
}

/** The message to show, or null when there is nothing to warn about. Another person contacted it in the last 30 days, or another person owns it. */
export function describeOverlap(team: Team | null | undefined, myUserId: string, company: string, now: number = Date.now()): string | null {
  if (!team) return null;
  const window = CONTACT_WINDOW_DAYS * 24 * 3600 * 1000;
  const recent = (team.contacted || [])
    .filter((c) => c && c.by && c.by !== myUserId && Date.parse(c.at || '') && now - Date.parse(c.at as string) <= window)
    .sort((a, b) => Date.parse(b.at as string) - Date.parse(a.at as string))[0];
  const owner = team.owner && team.owner.user_id && team.owner.user_id !== myUserId ? team.owner : null;
  if (!recent && !owner) return null;
  const parts: string[] = [];
  if (owner) parts.push(`${company} is owned by ${owner.email || 'a teammate'}.`);
  if (recent) parts.push(`A teammate already contacted ${company} by ${recent.channel || 'another channel'} on ${String(recent.at).slice(0, 10)}.`);
  return `${parts.join(' ')} Contact them anyway?`;
}

// % and _ are wildcards in ilike: a company called "100%_Safe" must match only itself.
const literal = (name: string) => name.replace(/[\\%_]/g, (c) => `\\${c}`);

/** { message, entity } when a teammate should be considered first, null otherwise (including every case where it could not be checked). */
export async function checkTeamOverlap(client: SupabaseLike, company: string | null | undefined, myUserId: string | null | undefined, now?: number): Promise<{ message: string; entity: string } | null> {
  const name = (company || '').trim();
  if (!name || !myUserId) return null;
  try {
    const { data, error } = await client.from('prospect_dossiers').select('entity_name, team').ilike('entity_name', literal(name)).limit(5);
    if (error || !Array.isArray(data)) return null;
    for (const row of data) {
      const message = describeOverlap(row.team, myUserId, name, now);
      if (message) return { message, entity: row.entity_name };
    }
    return null;
  } catch {
    return null;
  }
}

// What a request's answer means: did a message actually get queued (so this person reached out)? 'already', 'skipped', 'off' ... did not.
const NOT_A_CONTACT = new Set(['skipped', 'off', 'already', 'no_contact', 'not_found', 'failed', 'error']);
export const reachedOut = (status: unknown): boolean => typeof status === 'string' && status !== '' && !NOT_A_CONTACT.has(status);

/** Tells the shared book this person reached out, so everyone sees it and a second person is warned. Best effort: never throws, never makes a send look failed. */
export async function noteTeamContact(client: SupabaseLike, company: string | null | undefined, channel: Channel): Promise<void> {
  const name = (company || '').trim();
  if (!name) return;
  try {
    const found = await client.from('prospect_dossiers').select('entity_name').ilike('entity_name', literal(name)).limit(1);
    const entity = Array.isArray(found?.data) && found.data[0] ? found.data[0].entity_name : null;
    if (!entity) return;                                   // not in the prospect book: nothing to note (the database would say "company not found")
    await client.rpc('note_prospect_contact', { p_entity: entity, p_channel: channel });
  } catch {
    /* the message was already queued: a note that did not get through changes nothing about it */
  }
}
