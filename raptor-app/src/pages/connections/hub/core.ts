// Everything the Connections screens ask of the server and the database, in one place. It takes its dependencies as arguments (the
// Supabase client, the server address, a way to get the signed-in person's token), so the web app and the desktop app share it
// unchanged and it can be tested without a network. Reads come straight from the database (row-level security limits them to the
// person's own organization); every change goes through the server, which holds the secrets.

import { CHANNELS } from './channels';
import type { Conn, HubData, Sig } from './insights';

export interface FieldDef {
  name: string; label: string; placeholder: string; help: string; secret: boolean; required: boolean; multiline?: boolean;
  options?: { value: string; label: string }[] | null;
}
export interface ActionDef { name: string; label: string; description: string; fields: FieldDef[] }
export interface ProviderInfo {
  provider: string; title: string; description: string; category: string; channel: string; auth: 'none' | 'oauth'; can_reply: boolean; inbound: boolean;
  syncable: boolean; help: string[]; settings: string[]; available: boolean; min_sync_interval: number; fields: FieldDef[]; actions: ActionDef[];
  extra?: { events?: { value: string; label: string }[]; default_events?: string[] };
}
export interface Connection extends Conn { external_id: string | null; created_at: string; config: any }

export interface ApiDeps {
  supabase: any;
  base: string;                                         // e.g. https://…/api/raptor/connections
  getToken: () => Promise<string | undefined>;
  fetchFn?: typeof fetch;
}

const HISTORY_DAYS = 62;
const SIGNALS_PER_CHANNEL = 1500;
const COLUMNS = 'id, provider, label, external_id, status, config, last_sync_at, last_error, created_at';

export function friendlyLoadError(error: any): string {
  const text = String((error && (error.message || error.details)) || '');
  const code = error && error.code;
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(text)) {
    return 'Connections are not set up on this account yet. The database step still has to be run.';
  }
  return 'Could not load your connections. Check your internet connection and try again.';
}

export function makeApi(deps: ApiDeps) {
  const fetchFn = deps.fetchFn || fetch;

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

  return {
    call,
    providers: async (): Promise<ProviderInfo[]> => (await call('GET', '/providers')).providers || [],
    connect: (provider: string, inputs: Record<string, string>) => call('POST', '', { provider, inputs }).then((r) => r.connection as Connection),
    signIn: (provider: string) => call('POST', '/oauth/start', { provider }).then((r) => r.url as string),
    refresh: (id: string) => call('POST', `/${enc(id)}/sync`),
    pause: (id: string, paused: boolean) => call('PATCH', `/${enc(id)}`, { paused }),
    remove: (id: string) => call('DELETE', `/${enc(id)}`),
    rename: (id: string, label: string) => call('PATCH', `/${enc(id)}`, { label }),
    saveSettings: (id: string, settings: Record<string, unknown>) => call('PATCH', `/${enc(id)}`, { settings }),
    action: (id: string, name: string, params: Record<string, unknown> = {}) => call('POST', `/${enc(id)}/action/${enc(name)}`, { params }),
    reply: (id: string, parentId: string, text: string) => call('POST', `/${enc(id)}/reply`, { parent_id: parentId, text }),

    /** Connections, and the last two months of signals of every channel that has one, grouped by channel. */
    async load(now = Date.now()): Promise<HubData> {
      const { data: rows, error } = await deps.supabase.from('connections').select(COLUMNS).order('created_at', { ascending: true });
      if (error) throw new Error(friendlyLoadError(error));
      const connections = (rows || []) as Connection[];
      const since = new Date(now - HISTORY_DAYS * 86400000).toISOString();
      const signals: Record<string, Sig[]> = {};
      await Promise.all(CHANNELS.map(async (ch) => {
        const ids = connections.filter((c) => ch.providers.includes(c.provider)).map((c) => c.id);
        if (!ids.length) { signals[ch.key] = []; return; }
        const { data } = await deps.supabase.from('signals')
          .select('connection_id, provider, kind, name, value, text_value, entity, occurred_at')
          .in('connection_id', ids).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(SIGNALS_PER_CHANNEL);
        signals[ch.key] = (data || []) as Sig[];
      }));
      return { connections, signals };
    },
  };
}

export type Api = ReturnType<typeof makeApi>;
