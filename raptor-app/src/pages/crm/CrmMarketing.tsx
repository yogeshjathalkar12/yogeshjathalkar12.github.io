import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AudienceSegmentModal from '../../components/crm/AudienceSegmentModal';

export default function CrmMarketing() {
  const [segments, setSegments] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSegmentModal, setShowSegmentModal] = useState(false);

  // Email Dispatcher State
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [segRes, conRes] = await Promise.all([
        supabase.from('audience_lists').select('*').order('created_at', { ascending: false }),
        supabase.from('contacts').select('*'),
      ]);

      if (segRes.error) throw segRes.error;
      if (conRes.error) throw conRes.error;

      setSegments(segRes.data || []);
      setContacts(conRes.data || []);
    } catch (err) {
      console.error('Failed to load marketing data:', err);
    } finally {
      setLoading(false);
    }
  }

  function getSegmentRecipientCount(filterRules: any) {
    if (!filterRules) return contacts.length;
    return contacts.filter((c) => {
      if (filterRules.status && filterRules.status !== 'all' && c.status !== filterRules.status) return false;
      if (filterRules.min_score && (c.lead_score || 0) < filterRules.min_score) return false;
      return true;
    }).length;
  }

  async function handleDispatchEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSegment || !emailSubject.trim() || !emailBody.trim()) return;

    setDispatching(true);
    setDispatchSuccess(false);

    try {
      // Record campaign execution
      const { error } = await supabase.from('campaign_emails').insert({
        audience_list_id: selectedSegment,
        subject: emailSubject,
        body_template: emailBody,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

      if (error) throw error;

      setDispatchSuccess(true);
      setEmailSubject('');
      setEmailBody('');
    } catch (err) {
      console.error('Failed to dispatch campaign:', err);
    } finally {
      setDispatching(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading marketing automation…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem' }}>Marketing & Campaigns</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
            Manage targeted audience segments and dispatch direct multi-channel outreach.
          </div>
        </div>

        <button
          onClick={() => setShowSegmentModal(true)}
          style={{
            background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          + New Audience Segment
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.4rem' }}>
        {/* Audience Segments Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--white)', marginBottom: '1rem' }}>
            Audience Segments ({segments.length})
          </div>

          {segments.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>No segments created yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {segments.map((s) => {
                const count = getSegmentRecipientCount(s.filter_rules);
                return (
                  <div
                    key={s.id}
                    style={{ background: 'var(--surface2)', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--white)', fontSize: '0.75rem' }}>{s.name}</span>
                      <span style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '0.2rem 0.5rem', borderRadius: '10px' }}>
                        {count} Recipients
                      </span>
                    </div>
                    {s.description && <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginTop: '0.3rem' }}>{s.description}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Campaign Email Dispatcher */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--white)', marginBottom: '1rem' }}>
            Dispatch Sequence / Email
          </div>

          <form onSubmit={handleDispatchEmail}>
            <label style={{ fontSize: '0.55rem', color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
              Target Audience Segment
            </label>
            <select
              style={{ width: '100%', padding: '0.6rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: '4px', marginBottom: '0.8rem', fontSize: '0.7rem', fontFamily: 'var(--mono)' }}
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              required
            >
              <option value="">Select segment...</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({getSegmentRecipientCount(s.filter_rules)} contacts)
                </option>
              ))}
            </select>

            <label style={{ fontSize: '0.55rem', color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
              Email Subject Line
            </label>
            <input
              style={{ width: '100%', padding: '0.6rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: '4px', marginBottom: '0.8rem', fontSize: '0.7rem', fontFamily: 'var(--mono)' }}
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="e.g. Exclusive Q3 Product Demo Offer"
              required
            />

            <label style={{ fontSize: '0.55rem', color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
              Message Template
            </label>
            <textarea
              style={{ width: '100%', height: 100, padding: '0.6rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.7rem', fontFamily: 'var(--mono)', resize: 'vertical' }}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Write your email body sequence..."
              required
            />

            {dispatchSuccess && (
              <div style={{ color: 'var(--green)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>
                ✓ Campaign successfully dispatched to target list!
              </div>
            )}

            <button
              type="submit"
              disabled={dispatching}
              style={{ width: '100%', background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.65rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {dispatching ? 'Sending Broadcast…' : '🚀 Send Broadcast'}
            </button>
          </form>
        </div>
      </div>

      <AudienceSegmentModal open={showSegmentModal} onClose={() => setShowSegmentModal(false)} onCreated={fetchData} />
    </div>
  );
}