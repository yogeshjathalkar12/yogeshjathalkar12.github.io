import type React from 'react';
import { useState } from 'react';
import { useCurrency } from '../hooks/CurrencyContext';
import { useOrg } from '../hooks/OrgContext';
import { supabase } from '../lib/supabaseClient';
import { COUNTRIES } from '../lib/currency';
import TeamSection from '../components/team/TeamSection';

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '1.6rem',
  maxWidth: 480,
};

// Optional: lets someone who signed in with Google or an email link also use
// a password - needed for the Raptor desktop app, which signs in with email
// and password only.
function PasswordCard() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) { setMessage({ ok: false, text: 'Use at least 8 characters.' }); return; }
    if (password !== confirm) { setMessage({ ok: false, text: 'The two passwords don’t match.' }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setPassword('');
    setConfirm('');
    setMessage({ ok: true, text: 'Password saved. You can now sign in with your email and password, including on the desktop app.' });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.8rem', background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.75rem', borderRadius: '4px', marginBottom: '0.8rem',
  };

  return (
    <form style={cardStyle} onSubmit={handleSave}>
      <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '0.4rem' }}>Sign-in password</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
        Optional. If you usually sign in with Google or an emailed link, set a password here to also sign in with your email and password, which the Raptor desktop app needs.
      </div>
      <input style={inputStyle} type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <input style={inputStyle} type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {message && <div style={{ fontSize: '0.62rem', color: message.ok ? 'var(--green)' : 'var(--red)', marginBottom: '0.8rem' }}>{message.text}</div>}
      <button
        type="submit"
        disabled={saving || !password}
        style={{ padding: '0.65rem 1rem', background: 'var(--grad)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        {saving ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}

export default function Settings() {
  const { countryCode, setCountryCode, saving } = useCurrency();
  const { isOwner } = useOrg();
  const [justSaved, setJustSaved] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await setCountryCode(e.target.value);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.05em' }}>
        Settings
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '0.4rem' }}>
          Region & Currency
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
          Every deal value, pipeline total, and report across Raptor is shown in this currency.
        </div>

        <label
          style={{
            display: 'block',
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--dim)',
            marginBottom: '0.4rem',
          }}
        >
          Country
        </label>
        <select
          value={countryCode}
          onChange={handleChange}
          disabled={saving || !isOwner}
          style={{
            width: '100%',
            padding: '0.65rem 0.8rem',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--white)',
            fontFamily: 'var(--mono)',
            fontSize: '0.75rem',
            borderRadius: '4px',
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.currency})
            </option>
          ))}
        </select>

        {(saving || justSaved) && (
          <div style={{ fontSize: '0.6rem', color: saving ? 'var(--dim)' : 'var(--green)', marginTop: '0.8rem' }}>
            {saving ? 'Saving…' : '✓ Saved'}
          </div>
        )}
        {!isOwner && (
          <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: '0.8rem' }}>
            Set by your organization&rsquo;s owner.
          </div>
        )}
      </div>

      <PasswordCard />

      {isOwner && <TeamSection />}
    </div>
  );
}
