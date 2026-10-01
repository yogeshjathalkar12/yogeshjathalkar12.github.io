import type React from 'react';
import { useState } from 'react';
import { useCurrency } from '../hooks/CurrencyContext';
import { COUNTRIES } from '../lib/currency';

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '1.6rem',
  maxWidth: 480,
};

export default function Settings() {
  const { countryCode, setCountryCode, saving } = useCurrency();
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
          disabled={saving}
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
      </div>
    </div>
  );
}
