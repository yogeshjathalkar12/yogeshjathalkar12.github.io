// The CRM API (db/migrations/2026-11-28_n_api_keys.sql; served by websites-api raptor/crm/public_api_router.py).

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  can_write: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const apiBase = (serverUrl: string): string => `${serverUrl.replace(/\/+$/, '')}/api/raptor/v1`;

// The same fields as api_shape() in the database.
export const API_FIELDS: [string, string][] = [
  ['contacts', 'name (needed), email, phone, status (new, cold, active, hot), job_title, company_id, assignee_id, tags, custom_fields'],
  ['companies', 'name (needed), website_url, phone, email, address, city, industry, description, assignee_id, tags, custom_fields'],
  ['deals', 'title (needed), value, stage, contact_id, company_id, assignee_id, expected_close, probability, meeting_at, tags, custom_fields'],
  ['tasks', 'title (needed), notes, due_at, done_at, contact_id, deal_id, assignee_id'],
  ['notes', 'content (needed), type (note, call, meeting, email), direction (inbound, outbound), and contact_id, deal_id or company_id'],
];

export function apiExamples(serverUrl: string): { title: string; code: string }[] {
  const base = apiBase(serverUrl);
  const auth = '-H "Authorization: Bearer YOUR_KEY"';
  return [
    { title: 'Find a contact by email', code: `curl ${auth} "${base}/contacts?email=asha@example.com"` },
    { title: 'Add a contact', code: `curl ${auth} -H "Content-Type: application/json" -d '{"name":"Asha Rao","email":"asha@example.com"}' ${base}/contacts` },
    { title: 'Change a deal', code: `curl -X PATCH ${auth} -H "Content-Type: application/json" -d '{"stage":"won"}' ${base}/deals/DEAL_ID` },
    { title: 'Everything changed since a date', code: `curl ${auth} "${base}/deals?updated_since=2026-11-01T00:00:00Z&limit=500"` },
  ];
}
