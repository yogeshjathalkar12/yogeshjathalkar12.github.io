import { useCallback, useEffect, useState } from 'react';
import { type OrgMember, PERMISSIONS, loadMembers, resendInvite, setMemberManager } from '../../lib/team';
import InviteMemberModal from './InviteMemberModal';
import EditPermissionsModal from './EditPermissionsModal';
import RemoveMemberModal from './RemoveMemberModal';
import AuditLog from './AuditLog';
import { ghostBtnStyle, primaryBtnStyle } from '../crm/Modal';

const STATUS_COLORS: Record<string, string> = { active: 'var(--green)', invited: 'var(--yellow, #eab308)', removed: 'var(--dim2)' };

function summarize(m: OrgMember): string {
  if (m.is_owner) return 'Owner — full access';
  const on = PERMISSIONS.filter((p) => m.permissions?.[p.key]).map((p) => p.label.replace('’', "'"));
  return on.length ? on.join(', ') : 'Own records only, read-only';
}

// Owner-only. Members are added by invitation (one person, one
// organization); permissions are per-member toggles; removal is offboarding
// (access cut immediately, records reassigned, nothing deleted).
export default function TeamSection() {
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
              <span style={{ fontSize: '0.55rem', color: STATUS_COLORS[m.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.status}</span>
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 2 }}>{summarize(m)}</div>
            {!m.is_owner && (
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
              <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.35rem 0.7rem', fontSize: '0.55rem' }} onClick={() => setEditing(m)}>Permissions</button>
              {m.status === 'active' && (
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
        <div style={{ marginTop: '1rem', fontSize: '0.6rem', color: 'var(--dim2)' }}>
          Removed: {removed.map((m) => m.email).join(', ')}
        </div>
      )}

      <div style={{ marginTop: '1.4rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} onClick={() => setShowAudit((v) => !v)}>
          {showAudit ? 'Hide activity log' : 'Show activity log'}
        </button>
        {showAudit && <div style={{ marginTop: '0.8rem' }}><AuditLog emailsByUserId={emailsByUserId} /></div>}
      </div>

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={load} />
      <EditPermissionsModal member={editing} onClose={() => setEditing(null)} onSaved={load} />
      <RemoveMemberModal member={removing} members={members} onClose={() => setRemoving(null)} onRemoved={load} />
    </div>
  );
}
