import { useCallback, useEffect, useState } from 'react';
import { type OrgMember, PERMISSIONS, loadMembers, logAudit, reinstateMember, resendInvite, resetMemberMfa, setMemberAdmin, setMemberManager } from '../../lib/team';
import { useOrg } from '../../hooks/OrgContext';
import TransferOwnershipModal from './TransferOwnershipModal';
import InviteMemberModal from './InviteMemberModal';
import EditPermissionsModal from './EditPermissionsModal';
import RemoveMemberModal from './RemoveMemberModal';
import AuditLog from './AuditLog';
import { ghostBtnStyle, primaryBtnStyle } from '../crm/Modal';

const STATUS_COLORS: Record<string, string> = { active: 'var(--green)', invited: 'var(--yellow, #eab308)', removed: 'var(--dim2)' };

function summarize(m: OrgMember): string {
  if (m.is_owner) return 'Owner — full access';
  if (m.is_admin) return 'Admin — full access, runs the team';
  const on = PERMISSIONS.filter((p) => m.permissions?.[p.key]).map((p) => p.label.replace('’', "'"));
  return on.length ? on.join(', ') : 'Own records only, read-only';
}

// Owner and admins. Members are added by invitation (one person, one
// organization); permissions are per-member toggles; removal is offboarding
// (access cut immediately, records reassigned, nothing deleted).
export default function TeamSection() {
  const { isOwner, refresh: refreshOrg } = useOrg();
  const [showTransfer, setShowTransfer] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState<OrgMember | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await loadMembers());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load your team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleResend(m: OrgMember) {
    setNotice(null);
    try {
      await resendInvite(m.user_id);
      setNotice(`Invitation re-sent to ${m.email}.`);
    } catch (e: any) {
      setError(e.message || 'Could not resend the invitation.');
    }
  }

  async function handleReinstate(m: OrgMember) {
    setNotice(null);
    try {
      await reinstateMember(m.user_id);
      setError(null);
      setNotice(`${m.email} was re-added and emailed a link to rejoin.`);
    } catch (e: any) {
      setError(e.message || 'Could not re-add them.');
    }
    load();
  }

  async function handleAdmin(m: OrgMember, makeAdmin: boolean) {
    setNotice(null);
    if (makeAdmin && !window.confirm(`Make ${m.email} an admin? Admins can see and change everything and manage the team (not billing, transfer or the two-step policy).`)) return;
    try {
      await setMemberAdmin(m.id, makeAdmin);
      logAudit(makeAdmin ? 'admin_granted' : 'admin_removed', { user_id: m.user_id, email: m.email });
      setError(null);
      setNotice(makeAdmin ? `${m.email} is now an admin.` : `${m.email} is no longer an admin.`);
    } catch (e: any) {
      setError(e.message || 'Could not change admin access.');
    }
    load();
  }

  async function handleResetMfa(m: OrgMember) {
    setNotice(null);
    if (!window.confirm(`Reset two-step sign-in for ${m.email}? They'll be able to set up a new authenticator the next time they sign in.`)) return;
    try {
      const r = await resetMemberMfa(m.user_id);
      setError(null);
      setNotice(r.removed ? `Two-step sign-in reset for ${m.email}.` : `${m.email} had no two-step sign-in set up.`);
    } catch (e: any) {
      setError(e.message || 'Could not reset it.');
    }
  }

  async function handleManager(m: OrgMember, managerId: string) {
    setNotice(null);
    try {
      await setMemberManager(m.id, managerId || null);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not change who they report to.');
    }
    load();
  }

  const visible = members.filter((m) => m.status !== 'removed');
  const removed = members.filter((m) => m.status === 'removed');
  const emailsByUserId = Object.fromEntries(members.map((m) => [m.user_id, m.email || '']));

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.6rem', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.2rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '0.4rem' }}>Team</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
            Invite people to your organization and choose exactly what each can do. Members see only their own records unless you allow more.
          </div>
        </div>
        <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} onClick={() => setShowInvite(true)}>+ Invite</button>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{notice}</div>}
      {loading && <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Loading…</div>}

      {visible.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--white)' }}>
              {m.email}{' '}
              {m.is_admin && !m.is_owner && <span style={{ fontSize: '0.55rem', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>admin</span>}
              <span style={{ fontSize: '0.55rem', color: STATUS_COLORS[m.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.status}</span>
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 2 }}>{summarize(m)}</div>
            {!m.is_owner && (isOwner || !m.is_admin) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem' }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--dim2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Reports to</span>
                <select
                  value={m.manager_id || ''}
                  onChange={(e) => handleManager(m, e.target.value)}
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.58rem', borderRadius: 4, padding: '0.2rem 0.4rem' }}
                >
                  <option value="">Owner (top level)</option>
                  {members.filter((x) => x.status === 'active' && !x.is_owner && x.user_id !== m.user_id).map((x) => (
                    <option key={x.user_id} value={x.user_id}>{x.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {!m.is_owner && (
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              {m.status === 'invited' && (
                <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem' }} onClick={() => handleResend(m)}>Resend</button>
              )}
              {!m.is_admin && (
                <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem' }} onClick={() => setEditing(m)}>Permissions</button>
              )}
              {isOwner && m.status === 'active' && (
                <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem' }} onClick={() => handleAdmin(m, !m.is_admin)}>
                  {m.is_admin ? 'Remove admin' : 'Make admin'}
                </button>
              )}
              {m.status === 'active' && (isOwner || !m.is_admin) && (
                <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem' }} onClick={() => handleResetMfa(m)} title="They lost their phone">Reset 2-step</button>
              )}
              {m.status === 'active' && (isOwner || !m.is_admin) && (
                <button
                  type="button"
                  style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={() => setRemoving(m)}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {removed.length > 0 && (
        <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Removed members</div>
          {removed.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.35rem 0' }}>
              <span style={{ flex: 1, fontSize: '0.65rem', color: 'var(--dim)' }}>{m.email}</span>
              <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.3rem 0.7rem', fontSize: '0.55rem' }} onClick={() => handleReinstate(m)}>Re-add</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '1.4rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} onClick={() => setShowAudit((v) => !v)}>
          {showAudit ? 'Hide activity log' : 'Show activity log'}
        </button>
        {isOwner && (
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} onClick={() => setShowTransfer(true)}>
            Transfer ownership
          </button>
        )}
      </div>
      <div>
        {showAudit && <div style={{ marginTop: '0.8rem' }}><AuditLog emailsByUserId={emailsByUserId} /></div>}
      </div>

      <TransferOwnershipModal open={showTransfer} members={members} onClose={() => setShowTransfer(false)} onDone={() => { load(); refreshOrg(); }} />
      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={load} />
      <EditPermissionsModal member={editing} onClose={() => setEditing(null)} onSaved={load} />
      <RemoveMemberModal member={removing} members={members} onClose={() => setRemoving(null)} onRemoved={load} />
    </div>
  );
}
