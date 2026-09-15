import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime } from '../../lib/crmHelpers';

// system_dna.dna is a free-form jsonb blob (CompanyDNA + EnrichmentData on
// the desktop side - mission, value_proposition, pain_points, brand_voice,
// competitors, products_detailed, objection_handlers, etc.). Rendered
// generically rather than as a fixed form, since which fields are actually
// populated depends entirely on how much enrichment that account has run -
// checked a real live row before building this: as of today it only had
// mission/company_name/value_proposition, nowhere near the full set the
// desktop code supports.
function renderValue(value: any): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--dim2)' }}>—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--dim2)' }}>—</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {value.map((item, i) => (
          <span
            key={i}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.2rem 0.6rem',
              fontSize: '0.65rem',
              color: 'var(--white)',
            }}
          >
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--dim)' }}>{k.replace(/_/g, ' ')}: </span>
            <span style={{ color: 'var(--white)' }}>{v === '' || v == null ? '—' : String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span style={{ color: 'var(--white)' }}>{String(value)}</span>;
}

export default function SyncDna() {
  const [dna, setDna] = useState<Record<string, any> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDna();

    const channel = supabase
      .channel('sync-dna')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_dna' }, fetchDna)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchDna() {
    try {
      const { data, error } = await supabase.from('system_dna').select('*').maybeSingle();
      if (error) throw error;
      setDna(data?.dna || null);
      setUpdatedAt(data?.updated_at || null);
    } catch (error) {
      console.error('Failed to load system DNA:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading company DNA...</div>;
  }

  if (!dna) {
    return (
      <div className="arsenal-empty">
        <div className="arsenal-empty-icon">◌</div>
        <div className="arsenal-empty-text">No DNA synced from the desktop app yet.</div>
      </div>
    );
  }

  // _synced is the desktop app's internal sync bookkeeping flag, not real DNA content.
  const entries = Object.entries(dna).filter(([key]) => key !== '_synced');

  return (
    <div className="arsenal-card">
      <div className="arsenal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="arsenal-card-title">Company DNA</span>
        {updatedAt && (
          <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Updated {relativeTime(updatedAt)}</span>
        )}
      </div>
      <div className="arsenal-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {entries.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.75rem' }}>DNA record exists but has no fields set yet.</div>
        ) : (
          entries.map(([key, value]) => (
            <div key={key}>
              <div
                style={{
                  fontSize: '0.55rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--dim)',
                  marginBottom: '0.4rem',
                }}
              >
                {key.replace(/_/g, ' ')}
              </div>
              {renderValue(value)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
