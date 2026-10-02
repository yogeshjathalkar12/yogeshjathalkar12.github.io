import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../../components/crm/Modal';
import { initials, relativeTime, TYPE_ICON } from '../../lib/crmHelpers';
import { toolApiBase } from '../../lib/config';
import { findOrCreateCompany } from '../../lib/crmContacts';
import CustomFieldsSection from './CustomFieldsSection';
import AttachmentsSection from './AttachmentsSection';
import OwnerOnly from '../OwnerOnly';
import AssigneeSelect from './AssigneeSelect';
import RecordHistory from './RecordHistory';
import TasksSection from './TasksSection';

const WHATSAPP_API = toolApiBase('whatsapp');

interface ContactPanelProps {
  contact: any | null;
  interactions: any[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ContactPanel({ contact, interactions, onClose, onChanged }: ContactPanelProps) {
  const [status, setStatus] = useState(contact?.status || 'cold');
  const [activityType, setActivityType] = useState('note');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Edit mode: name/email/phone/company were previously read-only here
  // (only `status` had an input) - "edit everything, add things that
  // weren't added, like mail or a number" was the explicit ask. ---
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // --- WhatsApp thread state ---
  const [waLinks, setWaLinks] = useState<any[]>([]); // whatsapp_contacts rows linked to this CRM contact (one per connected number)
  const [waAccountId, setWaAccountId] = useState<string>('');
  const [waEvents, setWaEvents] = useState<any[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waReply, setWaReply] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(contact?.status || 'cold');
    setEditing(false);
    setEditError(null);
    if (contact) {
      fetchWaLinks();
    } else {
      setWaLinks([]);
      setWaEvents([]);
      setWaAccountId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  function startEditing() {
    setEditName(contact?.name || '');
    setEditEmail(contact?.email || '');
    setEditPhone(contact?.phone || '');
    setEditCompanyName(contact?.companies?.name || '');
    setEditError(null);
    setEditing(true);
  }

  async function handleDelete() {
    if (!confirm(`Delete ${contact.name}? This cannot be undone.`)) return;
    try {
      // THE FIX (2026-10-01): deleting a contact used to surface a raw
      // Postgres foreign-key-violation error (e.g. "...violates foreign
      // key constraint calls_contact_id_fkey on table calls") the moment
      // that contact had ANY call logged, deal attached, reminder,
      // automation run, or WhatsApp thread - six different tables
      // reference contacts.id, and Postgres rejects the delete rather
      // than leave any of them dangling. None of those records are
      // actually meant to disappear with the contact (call history, deal
      // history, etc. should survive) - just unlinked from a contact that
      // no longer exists, same "keep the record, drop the specific link"
      // spirit as deleting a Campaign elsewhere in this CRM. All six
      // columns are nullable, so this is safe.
      await Promise.all([
        supabase.from('deals').update({ contact_id: null }).eq('contact_id', contact.id),
        supabase.from('reminders').update({ contact_id: null }).eq('contact_id', contact.id),
        supabase.from('automation_runs').update({ contact_id: null }).eq('contact_id', contact.id),
        supabase.from('interactions').update({ contact_id: null }).eq('contact_id', contact.id),
        supabase.from('calls').update({ contact_id: null }).eq('contact_id', contact.id),
        supabase.from('whatsapp_contacts').update({ crm_contact_id: null }).eq('crm_contact_id', contact.id),
        supabase.from('whatsapp_conversations').update({ crm_contact_id: null }).eq('crm_contact_id', contact.id),
      ]);

      const { error: deleteErr } = await supabase.from('contacts').delete().eq('id', contact.id);
      if (deleteErr) throw deleteErr;
      onChanged();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete contact:', err);
      alert(err.message || 'Could not delete this contact.');
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Name is required.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const companyId = await findOrCreateCompany(editCompanyName);
      const { error: updateErr } = await supabase
        .from('contacts')
        .update({
          name: trimmedName,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          company_id: companyId,
        })
        .eq('id', contact.id);
      if (updateErr) throw updateErr;
      onChanged();
      setEditing(false);
    } catch (err: any) {
      console.error('Failed to update contact:', err);
      setEditError(err.message || 'Could not save those changes.');
    } finally {
      setEditSaving(false);
    }
  }

  useEffect(() => {
    if (!waAccountId || !contact?.phone) {
      setWaEvents([]);
      return;
    }
    fetchWaEvents(waAccountId, contact.phone);

    const channel = supabase
      .channel(`wa-thread-${contact.id}-${waAccountId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_events', filter: `account_id=eq.${waAccountId}` },
        (payload: any) => {
          if (payload.new.contact_phone === contact.phone) {
            setWaEvents((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waAccountId, contact?.phone]);

  async function fetchWaLinks() {
    if (!contact?.phone) {
      setWaLinks([]);
      return;
    }
    try {
      const { data } = await supabase
        .from('whatsapp_contacts')
        .select('id, account_id, phone, whatsapp_accounts(id, label)')
        .eq('crm_contact_id', contact.id);
      setWaLinks(data || []);
      setWaAccountId(data && data.length > 0 ? data[0].account_id : '');
    } catch (err) {
      console.error('Failed to load WhatsApp link:', err);
    }
  }

  async function fetchWaEvents(accountId: string, phone: string) {
    setWaLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_events')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_phone', phone)
        .order('created_at', { ascending: true })
        .limit(200);
      setWaEvents(data || []);
    } catch (err) {
      console.error('Failed to load WhatsApp thread:', err);
    } finally {
      setWaLoading(false);
    }
  }

  async function handleSendWaReply(e: React.FormEvent) {
    e.preventDefault();
    if (!waReply.trim() || !waAccountId || !contact?.phone) return;
    setWaSending(true);
    setWaError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${WHATSAPP_API}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ account_id: waAccountId, phone: contact.phone, text: waReply.trim() }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || 'Could not send message.');
      }
      setWaReply('');
    } catch (err: any) {
      setWaError(err.message || 'Could not send — the 24-hour reply window with this contact may have closed.');
    } finally {
      setWaSending(false);
    }
  }

  if (!contact) return null;

  const contactActivity = interactions.filter((i) => i.contact_id === contact.id);
  const waMessages = waEvents.filter((e) => e.event_type === 'sent' || e.event_type === 'received');

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    try {
      const { error: updateErr } = await supabase.from('contacts').update({ status: newStatus }).eq('id', contact.id);
      if (updateErr) throw updateErr;
      onChanged();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setError(err.message || 'Could not update status.');
    }
  }

  async function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('interactions').insert({
        contact_id: contact.id,
        type: activityType,
        content: content.trim(),
      });
      if (insertErr) throw insertErr;

      await supabase.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contact.id);

      setContent('');
      onChanged();
    } catch (err: any) {
      console.error('Failed to log activity:', err);
      setError(err.message || 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!contact} onClose={onClose} title="" width={480}>
      {editing ? (
        <form onSubmit={handleSaveEdit} style={{ marginBottom: '1.4rem' }}>
          <label style={fieldLabelStyle}>Name</label>
          <input style={fieldInputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} required placeholder="e.g. Jane Doe" />

          <label style={fieldLabelStyle}>Email</label>
          <input style={fieldInputStyle} type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="jane@acme.com" />

          <label style={fieldLabelStyle}>Phone</label>
          <input style={fieldInputStyle} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+1 555 000 0000" />

          <label style={fieldLabelStyle}>Company</label>
          <input style={fieldInputStyle} value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} placeholder="e.g. Acme Corp" />

          {editError && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{editError}</div>}

          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setEditing(false)} disabled={editSaving}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--grad)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: '1rem',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {initials(contact.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem' }}>{contact.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>{contact.companies?.name || 'No company on file'}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <OwnerOnly permission="edit"><button
                onClick={startEditing}
                style={{
                  background: 'transparent',
                  color: 'var(--dim)',
                  border: '1px solid var(--border)',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.6rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Edit
              </button></OwnerOnly>
              <OwnerOnly permission="delete"><button
                onClick={handleDelete}
                style={{
                  background: 'transparent',
                  color: 'var(--red)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.6rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Delete
              </button></OwnerOnly>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.4rem', fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
            <div>{contact.email || '— no email on file'}</div>
            <div>{contact.phone || '— no phone on file'}</div>
          </div>
        </>
      )}

      <label
        style={{
          fontSize: '0.55rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--dim)',
          marginBottom: '0.4rem',
          display: 'block',
        }}
      >
        Status
      </label>
      <select style={fieldInputStyle} value={status} onChange={(e) => handleStatusChange(e.target.value)}>
        <option value="cold">Cold</option>
        <option value="active">Active</option>
        <option value="hot">Hot</option>
      </select>

      <AssigneeSelect table="contacts" recordId={contact.id} value={contact.assignee_id ?? null} onChanged={onChanged} />
      <CustomFieldsSection entityType="contact" entity={contact} onChanged={onChanged} />
      <TasksSection contactId={contact.id} />

      <AttachmentsSection entityType="contact" entityId={contact.id} />
      <RecordHistory
        table="contacts"
        recordId={contact.id}
        refreshKey={[contact.updated_at, contact.assignee_id, contact.status, contact.name, contact.email, contact.phone, contact.company_id].join('|')}
      />

      {/* --- WhatsApp thread --- */}
      <div
        style={{
          fontSize: '0.55rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--dim)',
          margin: '1.2rem 0 0.6rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>WhatsApp</span>
        {waLinks.length > 1 && (
          <select
            value={waAccountId}
            onChange={(e) => setWaAccountId(e.target.value)}
            style={{
              background: 'var(--surface2)',
              color: 'var(--dim)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontSize: '0.55rem',
              padding: '0.2rem 0.4rem',
            }}
          >
            {waLinks.map((l) => (
              <option key={l.account_id} value={l.account_id}>
                {l.whatsapp_accounts?.label || l.account_id}
              </option>
            ))}
          </select>
        )}
      </div>

      {!contact.phone ? (
        <div
          style={{
            fontSize: '0.6rem',
            color: 'var(--dim2)',
            textAlign: 'center',
            padding: '1rem 0',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          No phone number on file — add one to enable WhatsApp.
        </div>
      ) : waLinks.length === 0 ? (
        <div
          style={{
            fontSize: '0.6rem',
            color: 'var(--dim2)',
            textAlign: 'center',
            padding: '1rem 0',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          Not linked to a WhatsApp number yet — connect one under WhatsApp → Connection.
        </div>
      ) : (
        <>
          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              marginBottom: '0.7rem',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.6rem 0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {waLoading ? (
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1rem 0' }}>Loading…</div>
            ) : waMessages.length === 0 ? (
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1rem 0' }}>No messages yet.</div>
            ) : (
              waMessages.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: e.direction === 'inbound' ? 'flex-start' : 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '78%',
                      background: e.direction === 'inbound' ? 'var(--surface2)' : 'var(--grad)',
                      color: e.direction === 'inbound' ? 'var(--white)' : '#fff',
                      borderRadius: '10px',
                      padding: '0.5rem 0.7rem',
                      fontSize: '0.68rem',
                    }}
                  >
                    <div>{e.body_text || <em style={{ opacity: 0.7 }}>[template message]</em>}</div>
                    <div style={{ fontSize: '0.52rem', opacity: 0.65, marginTop: '0.2rem', textAlign: 'right' }}>
                      {relativeTime(e.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendWaReply} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <input
              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
              placeholder="Reply on WhatsApp…"
              value={waReply}
              onChange={(e) => setWaReply(e.target.value)}
            />
            <button type="submit" style={{ ...primaryBtnStyle, flex: '0 0 auto' }} disabled={waSending}>
              {waSending ? '…' : 'Send'}
            </button>
          </form>
          {waError && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginBottom: '0.6rem' }}>{waError}</div>}
          <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginBottom: '1rem' }}>
            Free-text replies only work within 24 hours of their last message to you.
          </div>
        </>
      )}

      <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1rem 0 0.6rem' }}>
        Activity
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: contactActivity.length ? '0.4rem 0.9rem' : 0,
        }}
      >
        {contactActivity.length === 0 ? (
          <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1.2rem 0' }}>
            Nothing logged for this contact yet
          </div>
        ) : (
          contactActivity.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: '0.7rem', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>{TYPE_ICON[i.type] || '•'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)', textTransform: 'uppercase' }}>{i.type}</div>
                <div style={{ fontSize: '0.7rem', margin: '0.2rem 0' }}>{i.content}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>{relativeTime(i.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleLogActivity} style={{ display: 'flex', gap: '0.6rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 120, flexShrink: 0 }} value={activityType} onChange={(e) => setActivityType(e.target.value)}>
          <option value="note">Note</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
        </select>
        <input
          style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
          placeholder="Log an update…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" style={{ ...primaryBtnStyle, flex: '0 0 auto' }} disabled={saving}>
          {saving ? '…' : 'Add'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginTop: '0.8rem' }}>{error}</div>}
    </Modal>
  );
}