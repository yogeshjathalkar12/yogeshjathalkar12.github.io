// Everything the SMS screens ask of the database and the server, in one place. Like core.ts it takes its dependencies as arguments, so the
// web app and the desktop app share it unchanged and it can be tested without a network. Reads come straight from the database (row-level
// security limits them to the person's own organization); every change goes through the server (it holds the Twilio key) or through a
// database function that checks who may do it. See raptor/sms/ (server) and db/migrations/2026-10-21_sms.sql.

export interface SmsMessage {
  id: string; phone: string; direction: 'in' | 'out'; body: string; status: string; source: string; error: string | null;
  created_at: string; contact_id: string | null; deal_id: string | null;
}
export interface SmsSettings {
  mode: 'off' | 'semi' | 'auto'; connection_id: string | null; template: string; country_code: string; sequence_id: string | null; daily_limit: number;
  send_from_hour: number; send_until_hour: number; timezone: string; autoreply_enabled: boolean; opt_in_confirmed_at: string | null;
}
export interface SmsStep { delay_hours: number; text: string }
export interface SmsSequence { id: string; name: string; steps: SmsStep[]; stop_on_reply: boolean; is_active: boolean }
export interface SmsRule { id: string; keyword: string; match_type: 'exact' | 'contains'; reply_text: string; is_active: boolean }
export interface SmsEnrollment { id: string; sequence_id: string; phone: string; status: string; step: number; next_at: string; stop_reason: string | null }
export interface SmsDealChoice { id: string; title: string; name: string; phone: string; company: string }
export interface EnrollResult { deal_id: string; result: 'enrolled' | 'skipped'; reason?: string }
export interface SmsNumber { id: string; label: string; status: string; config: any }
export interface SmsThread { phone: string; name: string; last: SmsMessage; messages: SmsMessage[]; waiting: boolean }

export interface SmsDeps {
  supabase: any;
  base: string;                                         // e.g. https://…/api/raptor/sms
  getToken: () => Promise<string | undefined>;
  fetchFn?: typeof fetch;
}

export const DEFAULT_SETTINGS: SmsSettings = {
  mode: 'off', connection_id: null, template: '', country_code: '91', sequence_id: null, daily_limit: 100, send_from_hour: 9, send_until_hour: 21,
  timezone: 'Asia/Kolkata', autoreply_enabled: true, opt_in_confirmed_at: null,
};
export const MAX_ENROLL = 25;                           // keep in step with ENROLL_LIMIT in the server's engine.py
export const TAGS = ['first_name', 'last_name', 'name', 'company', 'deal_title'];
export const TIME_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

/** What each message status means for the person, in plain words. */
export function statusText(m: { direction: string; status: string; error?: string | null }): { text: string; tone: 'good' | 'warn' | 'dim' } {
  if (m.direction === 'in') return { text: 'Received', tone: 'dim' };
  switch (m.status) {
    case 'delivered': return { text: 'Delivered', tone: 'good' };
    case 'sent': return { text: 'Sent', tone: 'dim' };
    case 'queued': return { text: 'Sending…', tone: 'dim' };
    case 'undelivered': return { text: `Not delivered${m.error ? `: ${m.error}` : ''}`, tone: 'warn' };
    case 'failed': return { text: `Failed${m.error ? `: ${m.error}` : ''}`, tone: 'warn' };
    default: return { text: m.status, tone: 'dim' };
  }
}

export const SOURCE_TEXT: Record<string, string> = { manual: 'typed by a person', crm: 'from the pipeline', sequence: 'follow-up', autoreply: 'automatic answer', inbound: '' };

/** Messages grouped into one conversation per phone number, newest conversation first. `names` maps a contact id to its name. */
export function groupThreads(messages: SmsMessage[], names: Record<string, string> = {}): SmsThread[] {
  const byPhone = new Map<string, SmsMessage[]>();
  [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((m) => {
    const list = byPhone.get(m.phone) || [];
    list.push(m);
    byPhone.set(m.phone, list);
  });
  const threads: SmsThread[] = [];
  byPhone.forEach((list, phone) => {
    const last = list[list.length - 1];
    const named = list.find((m) => m.contact_id && names[m.contact_id]);
    threads.push({ phone, name: named ? names[named.contact_id as string] : '', last, messages: list, waiting: last.direction === 'in' });
  });
  return threads.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}

/** "In 2 days", "Tomorrow 10:30"... for the time a follow-up is due. */
export function dueText(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const hours = Math.round((t - now) / 3600000);
  if (hours <= 0) return 'due now';
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}

export function characters(text: string): string {
  const n = text.length;
  return `${n} character${n === 1 ? '' : 's'}${n > 160 ? ` · about ${Math.ceil(n / 153)} text segments` : ''}`;
}

export function makeSmsApi(deps: SmsDeps) {
  const fetchFn: typeof fetch = deps.fetchFn || ((...args) => fetch(...args));

  async function call(method: string, path = '', body?: unknown): Promise<any> {
    const token = await deps.getToken();
    if (!token) throw new Error('You are signed out. Sign in again.');
    let resp: Response;
    try {
      resp = await fetchFn(`${deps.base}${path}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the server. It may be waking up: wait a few seconds and try again.');
    }
    let json: any = {};
    try { json = await resp.json(); } catch { /* an empty or non-JSON body */ }
    if (!resp.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Something went wrong. Please try again.');
    return json;
  }

  const enc = encodeURIComponent;
  const missing = (error: any) => !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(error.message || '')));
  const read = async (query: any) => {
    const { data, error } = await query;
    if (error) throw new Error(missing(error) ? 'Text messaging is not set up on this account yet. The database step still has to be run.' : 'Could not load this. Check your internet connection and try again.');
    return data || [];
  };

  return {
    call,
    // reads
    messages: (limit = 400): Promise<SmsMessage[]> => read(deps.supabase.from('sms_messages').select('id, phone, direction, body, status, source, error, created_at, contact_id, deal_id').order('created_at', { ascending: false }).limit(limit)),
    settings: async (): Promise<SmsSettings> => {
      const { data, error } = await deps.supabase.from('sms_settings').select('*').maybeSingle();
      if (error) throw new Error(missing(error) ? 'Text messaging is not set up on this account yet. The database step still has to be run.' : 'Could not load the settings.');
      return { ...DEFAULT_SETTINGS, ...(data || {}) };
    },
    /** The Twilio numbers connected under Channels, SMS. */
    numbers: (): Promise<SmsNumber[]> => read(deps.supabase.from('connections').select('id, label, status, config').eq('provider', 'sms_twilio').order('created_at', { ascending: true })),
    sequences: (): Promise<SmsSequence[]> => read(deps.supabase.from('sms_sequences').select('id, name, steps, stop_on_reply, is_active').order('created_at', { ascending: true })),
    rules: (): Promise<SmsRule[]> => read(deps.supabase.from('sms_autoreplies').select('id, keyword, match_type, reply_text, is_active').order('created_at', { ascending: true })),
    enrollments: (): Promise<SmsEnrollment[]> => read(deps.supabase.from('sms_enrollments').select('id, sequence_id, phone, status, step, next_at, stop_reason').order('created_at', { ascending: false }).limit(300)),
    optouts: (): Promise<{ phone: string; created_at: string }[]> => read(deps.supabase.from('sms_optouts').select('phone, created_at').order('created_at', { ascending: false }).limit(300)),
    contactNames: async (ids: string[]): Promise<Record<string, string>> => {
      const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 200);
      if (!unique.length) return {};
      const { data } = await deps.supabase.from('contacts').select('id, name').in('id', unique);
      return Object.fromEntries((data || []).map((c: any) => [c.id, c.name]));
    },
    /** The deals that have a contact with a phone number, for choosing who to put into a sequence. */
    dealChoices: async (): Promise<SmsDealChoice[]> => {
      const rows = await read(deps.supabase.from('deals').select('id, title, contacts(name, phone), companies(name)').not('contact_id', 'is', null).order('created_at', { ascending: false }).limit(200));
      return rows.filter((d: any) => d.contacts && d.contacts.phone).map((d: any) => ({ id: d.id, title: d.title || '', name: d.contacts.name || '', phone: d.contacts.phone, company: (d.companies && d.companies.name) || '' }));
    },

    // changes
    send: (text: string, target: { phone?: string; dealId?: string; connectionId?: string }) =>
      call('POST', '/send', { text, phone: target.phone, deal_id: target.dealId, connection_id: target.connectionId }).then((r) => r.message as SmsMessage),
    dispatch: () => call('POST', '/crm/dispatch').catch(() => null),
    createSequence: (name: string, steps: SmsStep[], stopOnReply: boolean) => call('POST', '/sequences', { name, steps, stop_on_reply: stopOnReply }),
    updateSequence: (id: string, patch: Partial<{ name: string; steps: SmsStep[]; stop_on_reply: boolean; is_active: boolean }>) => call('PATCH', `/sequences/${enc(id)}`, patch),
    deleteSequence: (id: string) => call('DELETE', `/sequences/${enc(id)}`),
    enroll: (sequenceId: string, dealIds: string[]): Promise<{ results: EnrollResult[]; enrolled: number }> => call('POST', `/sequences/${enc(sequenceId)}/enroll`, { deal_ids: dealIds }),
    stopEnrollment: (id: string) => call('POST', `/enrollments/${enc(id)}/stop`),
    createRule: (keyword: string, replyText: string, matchType: 'exact' | 'contains') => call('POST', '/autoreplies', { keyword, reply_text: replyText, match_type: matchType }),
    updateRule: (id: string, patch: Partial<{ keyword: string; reply_text: string; match_type: string; is_active: boolean }>) => call('PATCH', `/autoreplies/${enc(id)}`, patch),
    deleteRule: (id: string) => call('DELETE', `/autoreplies/${enc(id)}`),
    addOptOut: (phone: string) => call('POST', '/optouts', { phone }),
    webhook: (connectionId: string): Promise<{ url: string; configured: boolean }> => call('GET', `/webhook/${enc(connectionId)}`),
    setupWebhook: (connectionId: string): Promise<{ url: string; configured: boolean }> => call('POST', `/webhook/${enc(connectionId)}/setup`),
    saveSettings: async (s: SmsSettings, optIn: boolean) => {
      const { error } = await deps.supabase.rpc('crm_sms_save', {
        p_mode: s.mode, p_connection: s.connection_id || null, p_template: s.template, p_country_code: s.country_code, p_sequence: s.sequence_id || null,
        p_daily_limit: s.daily_limit, p_from_hour: s.send_from_hour, p_until_hour: s.send_until_hour, p_timezone: s.timezone, p_autoreply: s.autoreply_enabled, p_opt_in: optIn,
      });
      if (error) throw new Error(error.message || 'Could not save.');
    },
    /** The pipeline's SMS button: queues the first text for a deal's contact. */
    requestDeal: async (dealId: string): Promise<{ status: string; error?: string }> => {
      const { data, error } = await deps.supabase.rpc('crm_sms_request', { p_deal_id: dealId });
      if (error) throw new Error(error.message || 'Could not queue the text message.');
      return data || { status: 'unknown' };
    },
  };
}

export type SmsApi = ReturnType<typeof makeSmsApi>;
