import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';

const WHATSAPP_API = toolApiBase('whatsapp');

export default function WaSequences() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [steps, setSteps] = useState([{ template_name: '', template_language: 'en_US', delay_hours: 0 }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrollTag, setEnrollTag] = useState<Record<string, string>>({});
  const [enrolling, setEnrolling] = useState<string | null>(null);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (accountId) fetchSequences(); }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchSequences() {
    const { data } = await supabase
      .from('whatsapp_sequences')
      .select('*, whatsapp_sequence_steps(*), whatsapp_sequence_enrollments(status)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setSequences(data || []);
  }

  function updateStep(idx: number, patch: Partial<{ template_name: string; template_language: string; delay_hours: number }>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addStep() { setSteps((prev) => [...prev, { template_name: '', template_language: 'en_US', delay_hours: 24 }]); }
  function removeStep(idx: number) { setSteps((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || steps.some((s) => !s.template_name.trim())) {
      setError('Name and every step\'s template name are required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { data: seq, error: seqErr } = await supabase.from('whatsapp_sequences').insert({ account_id: accountId, name: name.trim() }).select().single();
      if (seqErr) throw seqErr;

      const stepRows = steps.map((s, i) => ({
        sequence_id: seq.id,
        step_order: i,
        delay_hours: i === 0 ? 0 : s.delay_hours,
        template_name: s.template_name.trim(),
        template_language: s.template_language.trim() || 'en_US',
      }));
      const { error: stepErr } = await supabase.from('whatsapp_sequence_steps').insert(stepRows);
      if (stepErr) throw stepErr;

      setName('');
      setSteps([{ template_name: '', template_language: 'en_US', delay_hours: 0 }]);
      fetchSequences();
    } catch (err: any) {
      setError(err.message || 'Could not create sequence.');
    } finally {
      setCreating(false);
    }
  }

  async function handleEnroll(sequenceId: string) {
    const tag = (enrollTag[sequenceId] || '').trim();
    setEnrolling(sequenceId);
    try {
      let query = supabase.from('whatsapp_contacts').select('id').eq('account_id', accountId);
      if (tag) query = query.contains('tags', [tag]);
      const { data: contacts } = await query;
      const contactIds = (contacts || []).map((c) => c.id);
      if (contactIds.length === 0) { alert('No matching contacts found.'); return; }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      await fetch(`${WHATSAPP_API}/sequences/${sequenceId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ contact_ids: contactIds }),
      });
      fetchSequences();
    } catch (err) {
      console.error('Failed to enroll contacts:', err);
    } finally {
      setEnrolling(null);
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;
  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a WhatsApp number first.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
        </select>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 600 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Drip Sequence</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Sequence name" value={name} onChange={(e) => setName(e.target.value)} />
          {steps.map((step, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--dim)', width: 50 }}>Step {idx + 1}</span>
              <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Template name" value={step.template_name} onChange={(e) => updateStep(idx, { template_name: e.target.value })} />
              {idx > 0 && (
                <input style={{ ...fieldInputStyle, marginBottom: 0, width: 100 }} type="number" placeholder="hrs wait" value={step.delay_hours} onChange={(e) => updateStep(idx, { delay_hours: Number(e.target.value) })} />
              )}
              {steps.length > 1 && <button type="button" onClick={() => removeStep(idx)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.3rem 0.5rem' }}>✕</button>}
            </div>
          ))}
          <button type="button" onClick={addStep} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.4rem', alignSelf: 'flex-start' }}>
            + Add step
          </button>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>{creating ? 'Creating…' : 'Create Sequence'}</button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Sequences</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {sequences.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No sequences yet.</div>
        ) : (
          sequences.map((s) => {
            const active = (s.whatsapp_sequence_enrollments || []).filter((e: any) => e.status === 'active').length;
            return (
              <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{s.name}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{(s.whatsapp_sequence_steps || []).length} steps · {active} active enrollments</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <input
                    style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                    placeholder="Enroll by tag (blank = all contacts)"
                    value={enrollTag[s.id] || ''}
                    onChange={(e) => setEnrollTag((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => handleEnroll(s.id)}
                    disabled={enrolling === s.id}
                    style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', textTransform: 'uppercase' }}
                  >
                    {enrolling === s.id ? 'Enrolling…' : 'Enroll'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
