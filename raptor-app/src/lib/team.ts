import { supabase } from './supabaseClient';
import { toolApiBase } from './config';

// Organizations & members. An organization's id is its owner's auth user id
// (the value already stored in `owner_id` on every CRM row); members are
// extra auth accounts linked to it through `org_members`. The database
// (db/migrations/2026-10-03_*.sql in the Raptor B2B repo) is the real
// enforcement - everything here is the UI over it. Kept in sync by hand with
// the desktop app's src/team.js.

export type Permission = 'view_all' | 'create' | 'edit' | 'delete' | 'manage_pipeline' | 'manage_automations';
export type MemberStatus = 'invited' | 'active' | 'removed';

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: 'view_all', label: 'See everyone’s records', hint: 'Off = their own records, plus those of anyone who reports to them' },
  { key: 'create', label: 'Create records', hint: 'Contacts, deals, notes, calls, attachments' },
  { key: 'edit', label: 'Edit records', hint: 'Change records they can see' },
  { key: 'delete', label: 'Delete records', hint: 'Remove records they can see' },
  { key: 'manage_pipeline', label: 'Manage pipeline', hint: 'Pipeline stages and custom fields' },
  { key: 'manage_automations', label: 'Manage automations', hint: 'Automations and campaigns' },
];

// Presets only pre-fill the toggles - the toggles are what's stored.
export const PRESETS: { name: string; permissions: Permission[] }[] = [
  { name: 'Rep', permissions: ['create', 'edit'] },
  { name: 'Viewer', permissions: [] },
  // Sees their own records plus those of everyone who reports to them (set
  // "Reports to" on the Team card) - not the whole organization.
  { name: 'Manager', permissions: ['create', 'edit', 'delete', 'manage_pipeline'] },
  { name: 'Org-wide', permissions: ['view_all', 'create', 'edit', 'delete', 'manage_pipeline'] },
];

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  email: string | null;
  is_owner: boolean;
  is_admin: boolean;
  status: MemberStatus;
  manager_id: string | null;
  preset: string | null;
  permissions: Partial<Record<Permission, boolean>>;
  created_at: string;
  accepted_at: string | null;
  removed_at: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  detail: Record<string, any>;
  created_at: string;
}

async function teamFetch<T = any>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const resp = await fetch(`${toolApiBase('team')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Something went wrong. Please try again.');
  return json as T;
}

export const inviteMember = (email: string, permissions: Partial<Record<Permission, boolean>>, preset: string | null) =>
  teamFetch('/invite', { email, permissions, preset });

export const resendInvite = (userId: string) => teamFetch('/resend-invite', { user_id: userId });

export const removeMember = (userId: string, reassignTo: string) =>
  teamFetch<{ reassigned: Record<string, number>; warnings: string[] }>('/remove', { user_id: userId, reassign_to: reassignTo });

export type OtpPurpose = 'export' | 'transfer';
export const sendOtp = (purpose: OtpPurpose) => teamFetch('/otp/send', { purpose });
export const verifyOtp = (purpose: OtpPurpose, code: string) => teamFetch('/otp/verify', { purpose, code });
export const sendExportOtp = () => sendOtp('export');
export const verifyExportOtp = (code: string) => verifyOtp('export', code);

// Bring a removed member back (they accept again from an emailed link).
export const reinstateMember = (userId: string) => teamFetch('/reinstate', { user_id: userId });
// Owner only, and only straight after verifyOtp('transfer', ...).
export const transferOwnership = (userId: string) => teamFetch('/transfer-ownership', { user_id: userId });
// A member lost their phone: clear their authenticator so they can set up a new one.
export const resetMemberMfa = (userId: string) => teamFetch<{ removed: number }>('/reset-mfa', { user_id: userId });

/** Owner only (the database refuses anyone else). */
export async function setMemberAdmin(memberId: string, isAdmin: boolean) {
  const { error } = await supabase.from('org_members').update({ is_admin: isAdmin }).eq('id', memberId);
  if (error) throw error;
}

export async function setRequireMfa(on: boolean) {
  const { error } = await supabase.rpc('set_require_mfa', { p_on: on });
  if (error) throw error;
}

export async function loadMembers(): Promise<OrgMember[]> {
  const { data, error } = await supabase.from('org_members').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as OrgMember[];
}

export async function updateMemberPermissions(memberId: string, permissions: Partial<Record<Permission, boolean>>, preset: string | null) {
  const { error } = await supabase.from('org_members').update({ permissions, preset }).eq('id', memberId);
  if (error) throw error;
}

export async function loadAuditLog(limit = 50): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as AuditEntry[];
}

// A verified export code is good for 10 minutes (same window the server
// records), held only in memory so a page reload asks again.
let exportVerifiedUntil = 0;
export const isExportVerified = () => Date.now() < exportVerifiedUntil;
export const markExportVerified = () => { exportVerifiedUntil = Date.now() + 10 * 60 * 1000; };

export async function logAudit(action: string, detail: Record<string, any>) {
  const { error } = await supabase.rpc('log_audit', { p_action: action, p_detail: detail });
  if (error) console.error('Audit log write failed:', error);
}


// ---------------------------------------------------------------------------
// Reporting lines, assignment and record history
// (db/migrations/2026-10-04_hierarchy_assignment_history.sql)
// ---------------------------------------------------------------------------

export interface DirectoryEntry {
  user_id: string;
  email: string;
  is_me: boolean;
  is_owner: boolean;
  manager_id: string | null;
  can_assign: boolean;
  preset: string | null;
}

/** "jane@acme.com" -> "jane" - what the lists show for a person. */
export const shortName = (email: string | null | undefined) => (email ? email.split('@')[0] : 'Someone');

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));
}

/** The people the caller can see and assign to. Empty (not an error) if the
 *  database hasn't been upgraded yet - everything then behaves as before. */
export async function loadDirectory(): Promise<DirectoryEntry[]> {
  const { data, error } = await supabase.rpc('team_directory');
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data || []) as DirectoryEntry[];
}

export async function loadMemberLabels(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.rpc('member_labels', { p_ids: unique });
  if (error) return {};
  return Object.fromEntries((data || []).map((r: { user_id: string; email: string }) => [r.user_id, r.email]));
}

export async function setMemberManager(memberId: string, managerId: string | null) {
  const { error } = await supabase.from('org_members').update({ manager_id: managerId }).eq('id', memberId);
  if (error) throw error;
}

export type HistoryTable = 'contacts' | 'deals' | 'companies';

export interface HistoryEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  label: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  actor_id: string | null;
  created_at: string;
}

export async function loadRecordHistory(table: HistoryTable, recordId: string): Promise<HistoryEntry[]> {
  const { data, error } = await supabase.rpc('record_history', { p_table: table, p_record: recordId });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data || []) as HistoryEntry[];
}


// ---------------------------------------------------------------------------
// Manager report (db/migrations/2026-10-05_admin_transfer_mfa_tasks_reports.sql)
// ---------------------------------------------------------------------------

export interface TeamReportRow {
  user_id: string;
  email: string;
  contacts_added: number;
  deals_created: number;
  deals_won: number;
  won_value: number;
  deals_lost: number;
  open_deals: number;
  open_value: number;
  tasks_done: number;
  tasks_open: number;
  tasks_overdue: number;
  calls_made: number;
  call_minutes: number;
  notes_logged: number;
}

/** One row per person the caller may see (a manager gets their team, an
 *  owner/admin/org-wide viewer gets everyone). `to` is exclusive. */
export async function loadTeamReport(from: Date, to: Date): Promise<TeamReportRow[]> {
  const { data, error } = await supabase.rpc('team_report', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data || []).map((r: any) => ({ ...r, won_value: Number(r.won_value) || 0, open_value: Number(r.open_value) || 0 })) as TeamReportRow[];
}
