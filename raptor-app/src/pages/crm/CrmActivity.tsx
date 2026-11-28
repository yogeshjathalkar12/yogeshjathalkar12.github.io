import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime, TYPE_ICON } from '../../lib/crmHelpers';
import LogActivity from '../../components/crm/LogActivity';
import OwnerOnly from '../../components/OwnerOnly';

const TYPE_FILTERS = ['all', 'note', 'email', 'call', 'meeting', 'whatsapp'];

export default function CrmActivity() {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-activity-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select('*, contacts(id, name, companies(id, name))')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setInteractions(data || []);
    } catch (error) {
      console.error('Failed to load activity:', error);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this entry from the timeline? This cannot be undone.')) return;
    setError('');
    const { data, error: failed } = await supabase.from('interactions').delete().eq('id', id).select('id');
    if (failed || !data?.length) setError(failed?.message || 'You may not remove this entry.');
    else fetchAll();
  }

  const q = search.trim().toLowerCase();
  const filtered = interactions.filter((i) => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (!q) return true;
    return (
      (i.content || '').toLowerCase().includes(q) ||
      (i.contacts?.name || '').toLowerCase().includes(q) ||
      (i.contacts?.companies?.name || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading activity…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activity, contacts, companies…"
          style={{
            flex: 1, minWidth: 220, maxWidth: 320, padding: '0.6rem 0.9rem', background: 'var(--surface2)',
            border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.7rem', borderRadius: '4px',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <OwnerOnly permission="create"><button
            type="button"
            onClick={() => setLogging(!logging)}
            style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.5rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            + Log activity
          </button></OwnerOnly>
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                background: typeFilter === t ? 'var(--grad)' : 'transparent',
                color: typeFilter === t ? '#fff' : 'var(--dim)',
                border: '1px solid var(--border)',
                padding: '0.5rem 0.8rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {logging && <LogActivity onLogged={fetchAll} onClose={() => setLogging(false)} />}
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: 8 }}>{error}</div>}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.7rem' }}>
            {interactions.length === 0 ? 'No activity logged yet.' : 'Nothing matches your filters.'}
          </div>
        ) : (
          filtered.map((i) => (
            <div
              key={i.id}
              style={{ display: 'flex', gap: '0.9rem', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: '0.9rem' }}>{TYPE_ICON[i.type] || '•'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--white)' }}>
                  {i.contacts?.name || 'Unknown contact'}
                  <span style={{ color: 'var(--dim)' }}> · {i.contacts?.companies?.name || 'No company'} · {i.type}</span>
                </div>
                <div style={{ fontSize: '0.75rem', margin: '0.3rem 0' }}>{i.content}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--dim2)' }}>{relativeTime(i.created_at)}</div>
              </div>
              <OwnerOnly permission="delete"><button
                type="button"
                onClick={() => remove(i.id)}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.55rem', textTransform: 'uppercase' }}
              >
                Remove
              </button></OwnerOnly>
            </div>
          ))
        )}
      </div>
    </div>
  );
}