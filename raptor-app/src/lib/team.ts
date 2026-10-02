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
  { key: 'view_all', label: 'See everyone’s records', hint: 'Off = only records they created or are assigned' },
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
  { name: 'Manager', permissions: ['view_all', 'create', 'edit', 'delete', 'manage_pipeline'] },
];

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  email: string | null;
  is_owner: boolean;
  status: MemberStatus;
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

export const sendExportOtp = () => teamFetch('/otp/send', { purpose: 'export' });
export const verifyExportOtp = (code: string) => teamFetch('/otp/verify', { purpose: 'export', code });

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
