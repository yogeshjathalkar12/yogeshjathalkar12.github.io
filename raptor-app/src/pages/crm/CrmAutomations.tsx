import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { describeRule } from '../../lib/automationRules';
import AutomationModal from '../../components/crm/AutomationModal';
import { useColumn } from '../../hooks/useColumn';
import { useDirectory } from '../../hooks/useDirectory';
import { loadPipelineStages } from '../../lib/pipelineStages';
import { loadPipelines, stageChoices } from '../../lib/pipelines';
import { DesktopAutomationTools } from '../../lib/desktop';

export default function CrmAutomations() {
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [stages, setStages] = useState<[string, string][]>([]);
  const installed = useColumn('automations', 'trigger_value') === true;
  const scoring = useColumn('automations', 'baseline_at') === true;
  const { entries } = useDirectory();
  const people = entries.map((p) => [p.user_id, p.email] as [string, string]);
  const names = { stages: Object.fromEntries(stages), people: Object.fromEntries(people) };

  useEffect(() => {
    Promise.all([loadPipelineStages(), loadPipelines(supabase)])
      .then(([all, pipelines]) => setStages(stageChoices(all, pipelines)))
      .catch((error) => console.error('Failed to load pipeline stages:', error));
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('crm-automations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automations' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAutomations(data || []);
    } catch (error) {
      console.error('Failed to load automations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(a: any) {
    try {
      const { error } = await supabase.from('automations').update({ enabled: !a.enabled }).eq('id', a.id);
      if (error) throw error;
      fetchAll();
    } catch (error) {
      console.error('Failed to toggle automation:', error);
    }
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(a: any) {
    setEditing(a);
    setModalOpen(true);
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading automations…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>
          Rules run automatically in the background as your pipeline and contacts change.
        </div>
        <button
          onClick={openNew}
          style={{
            background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
          }}
        >
          + New Automation
        </button>
      </div>

      {automations.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          padding: '3rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.7rem',
        }}>
          No automations yet. Create one to start acting on your pipeline automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {automations.map((a) => {
            const { when, then } = describeRule(a, names);
            return (
              <div
                key={a.id}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                  padding: '1.1rem 1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: '1rem', opacity: a.enabled === false ? 0.5 : 1,
                }}
              >
                <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => openEdit(a)}>
                  <div style={{ fontSize: '0.75rem' }}>
                    When <strong>{when}</strong>, {then}.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: a.enabled === false ? 'var(--dim2)' : 'var(--green)',
                  }}>
                    {a.enabled === false ? 'Paused' : 'Active'}
                  </span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 34, height: 18, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={a.enabled !== false}
                      onChange={() => toggleEnabled(a)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      background: a.enabled === false ? 'var(--surface2)' : 'var(--grad)',
                      border: '1px solid var(--border)', transition: 'background 0.15s',
                    }} />
                    <span style={{
                      position: 'absolute', top: 2, left: a.enabled === false ? 2 : 18,
                      width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                    }} />
                  </label>
                  <button
                    onClick={() => openEdit(a)}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
                      padding: '0.4rem 0.7rem', borderRadius: '4px', cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DesktopAutomationTools onChanged={fetchAll} />

      <AutomationModal
        open={modalOpen}
        automation={editing}
        installed={installed}
        scoring={scoring}
        stages={stages}
        people={people}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAll}
      />
    </div>
  );
}