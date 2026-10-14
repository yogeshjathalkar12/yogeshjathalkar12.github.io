import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, fieldLabelStyle, ghostBtnStyle, primaryBtnStyle } from './Modal';

// WhatsApp mode and template for the pipeline, the counterpart of the email dialog. Stored per organization
// (crm_whatsapp_settings) and changed only through crm_wa_save, which lets just the owner or an admin do it.
// What each mode does, and the safeguards, are in db/migrations/2026-10-14_crm_whatsapp.sql.

export type WhatsAppMode = 'off' | 'semi' | 'auto';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const SLOTS = 3;
const VARIABLES: { value: string; label: string }[] = [
  { value: '', label: 'Not used' },
  { value: 'first_name', label: "Contact's first name" },
  { value: 'last_name', label: "Contact's last name" },
  { value: 'name', label: "Contact's full name" },
  { value: 'company', label: 'Company name' },
  { value: 'deal_title', label: 'Deal title' },
];

const MODES: { value: WhatsAppMode; title: string; text: string }[] = [
  { value: 'off', title: 'Off', text: 'Nothing is sent.' },
  { value: 'semi', title: 'Semi-automatic', text: 'Each deal with a contact gets a WhatsApp button next to Call. Nothing is sent until you click it.' },
  { value: 'auto', title: 'Automatic', text: 'The message goes out as soon as a new deal with a contact phone number is added. Bulk imports are never messaged automatically.' },
];

export default function WhatsAppSettingsModal({ open, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<WhatsAppMode>('off');
  const [accounts, setAccounts] = useState<{ id: string; label: string; phone_number_id: string }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [template, setTemplate] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [slots, setSlots] = useState<string[]>(Array(SLOTS).fill(''));
  const [countryCode, setCountryCode] = useState('91');
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    Promise.all([
      supabase.from('crm_whatsapp_settings').select('mode, account_id, template_name, template_language, params, country_code, opt_in_confirmed_at').maybeSingle(),
      supabase.from('whatsapp_accounts').select('id, label, phone_number_id').order('created_at', { ascending: false }),
    ])
      .then(([settings, accts]) => {
        if (settings.error) { setError('WhatsApp automation is not available yet: the database part still has to be installed.'); return; }
        const list = accts.data || [];
        setAccounts(list);
        const s: any = settings.data;
        if (s) {
          setMode(s.mode as WhatsAppMode);
          setAccountId(s.account_id || list[0]?.id || '');
          setTemplate(s.template_name || '');
          setLanguage(s.template_language || 'en_US');
          const params: string[] = s.params || [];
          setSlots(Array.from({ length: SLOTS }, (_v, i) => params[i] || ''));
          setCountryCode(s.country_code || '91');
          setConfirmedAt(s.opt_in_confirmed_at);
          setOptIn(!!s.opt_in_confirmed_at);
        } else {
          setAccountId(list[0]?.id || '');
        }
      })
      .then(() => setLoading(false), () => setLoading(false));
  }, [open]);

  async function save() {
    setError(null);
    if (mode !== 'off' && !optIn) {
      setError('Please confirm that your contacts agreed to receive WhatsApp messages from you.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.rpc('crm_wa_save', {
      p_mode: mode,
      p_account: accountId || null,
      p_template: template.trim() || null,
      p_language: language.trim() || 'en_US',
      p_params: slots.filter(Boolean),
      p_country_code: countryCode.trim() || '91',
      p_opt_in: optIn,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="WhatsApp automation" width={560}>
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>
      ) : (
        <>
          <label style={fieldLabelStyle}>Mode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.2rem' }}>
            {MODES.map((m) => (
              <label
                key={m.value}
                style={{
                  display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.7rem 0.8rem', borderRadius: 4,
                  border: `1px solid ${mode === m.value ? 'var(--purple)' : 'var(--border)'}`,
                  background: mode === m.value ? 'rgba(168,85,247,0.08)' : 'transparent',
                }}
              >
                <input type="radio" name="wa-mode" checked={mode === m.value} onChange={() => setMode(m.value)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{m.title}</span>
                  <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 }}>{m.text}</span>
                </span>
              </label>
            ))}
          </div>

          {mode !== 'off' && (
            <>
              <label style={fieldLabelStyle}>Send from this WhatsApp number</label>
              {accounts.length === 0 ? (
                <div style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: '1rem' }}>
                  No WhatsApp number is connected yet. Connect one under WhatsApp, Connection, then come back.
                </div>
              ) : (
                <select style={fieldInputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.phone_number_id})</option>)}
                </select>
              )}

              <label style={fieldLabelStyle}>Template name</label>
              <input style={fieldInputStyle} value={template} placeholder="e.g. intro_offer" onChange={(e) => setTemplate(e.target.value.toLowerCase())} />
              <div style={{ fontSize: '0.58rem', color: 'var(--dim)', lineHeight: 1.7, margin: '-0.6rem 0 1rem' }}>
                WhatsApp only lets you start a chat with a template Meta has approved. Type its name exactly as in WhatsApp Manager, Message Templates.
                Your Meta test number comes with one called <code>hello_world</code>, which has no variables.
              </div>

              <label style={fieldLabelStyle}>Template language</label>
              <input style={fieldInputStyle} value={language} placeholder="en_US" onChange={(e) => setLanguage(e.target.value)} />

              <label style={fieldLabelStyle}>What fills the template's blanks</label>
              {slots.map((value, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--dim)', minWidth: 42 }}>{`{{${i + 1}}}`}</span>
                  <select
                    style={{ ...fieldInputStyle, marginBottom: 0 }}
                    value={value}
                    onChange={(e) => setSlots((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))}
                  >
                    {VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ fontSize: '0.58rem', color: 'var(--dim)', lineHeight: 1.7, margin: '0.2rem 0 1rem' }}>
                Pick one for each blank in your template, in order. The number of blanks must match your template exactly, or WhatsApp refuses the message.
              </div>

              <label style={fieldLabelStyle}>Country code for 10-digit numbers</label>
              <input style={fieldInputStyle} value={countryCode} inputMode="numeric" maxLength={3} onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))} />

              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: '1rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  My contacts agreed to receive WhatsApp messages from me. WhatsApp can ban a number that messages people who did not agree, and I am responsible for who I message.
                  {confirmedAt && <span style={{ display: 'block', color: 'var(--dim2)' }}>Confirmed on {new Date(confirmedAt).toLocaleDateString()}.</span>}
                </span>
              </label>

              <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '1rem' }}>
                Messages are sent while Raptor is open in your browser, within your WhatsApp number's business hours and daily limit.
                Nobody is messaged twice within 30 days, and people who answered STOP are skipped. A Meta test number can only message the phone numbers you added to its allowed list.
              </div>
            </>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={onClose}>Cancel</button>
            <button type="button" style={primaryBtnStyle} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
