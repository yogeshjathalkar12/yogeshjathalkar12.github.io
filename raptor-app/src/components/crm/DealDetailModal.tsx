import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { findOrCreateContact } from '../../lib/crmContacts';
import { type PipelineStage, loadPipelineStages, stageByKey } from '../../lib/pipelineStages';
import CustomFieldsSection from './CustomFieldsSection';
import AttachmentsSection from './AttachmentsSection';
import OwnerOnly from '../OwnerOnly';
import AssigneeSelect from './AssigneeSelect';
import RecordHistory from './RecordHistory';
import TasksSection from './TasksSection';
import ActivityTimeline from './ActivityTimeline';
import { selectAll } from '../../lib/selectAll';
import { activeCurrencyCode } from '../../lib/currency';
import ForecastFields from './ForecastFields';
import { useColumn } from '../../hooks/useColumn';
import { forecastValues, stageProbability } from '../../lib/forecast';
import { moveToBin } from '../../lib/bulk';
import StageOptions from './StageOptions';
import TagsEditor from './TagsEditor';
import DealMoneyFields from './DealMoneyFields';
import { dealMoneyRow, moneyOf, moneyProblem, ownMoney } from '../../lib/fx';
import DealCompetitionFields, { competitionOf, competitionRow } from './DealCompetitionFields';
import DealSurvey from './DealSurvey';
import { Link } from 'react-router-dom';

interface DealDetailModalProps {
  deal: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DealDetailModal({ deal, onClose, onSaved }: DealDetailModalProps) {
  const [value, setValue] = useState('0');
  const [stage, setStage] = useState('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const hasBin = useColumn('deals', 'deleted_at');
  const [closeDate, setCloseDate] = useState('');
  const [probability, setProbability] = useState('');
  const forecast = useColumn('deals', 'expected_close');
  const quotes = useColumn('quotes', 'id');
  const currencies = useColumn('deals', 'currency');
  const [money, setMoney] = useState(ownMoney);
  const competitionColumns = useColumn('deals', 'competitors');
  const [competition, setCompetition] = useState(() => competitionOf({}));
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactId, setContactId] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deal) {
      setValue(String(deal.value ?? 0));
      setMoney(moneyOf(deal));
      setCompetition(competitionOf(deal));
      setStage(deal.stage);
      setCampaignId(deal.campaign_id || '');
      setCloseDate(deal.expected_close || '');
      setProbability(deal.probability === null || deal.probability === undefined ? '' : String(deal.probability));
      setContactId(deal.contact_id || '');
      setAddingContact(false);
      setNewContactName('');
      setNewContactEmail('');
      setError(null);
      fetchCampaigns();
      fetchContacts();
      loadPipelineStages().then(setStages).catch((err) => console.error('Failed to load pipeline stages:', err));
    }
  }, [deal]);

  async function fetchCampaigns() {
    try {
      const { data, error } = await supabase.from('campaigns').select('id, name').order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  }

  async function fetchContacts() {
    try {
      const { data, error } = await selectAll(() => supabase.from('contacts').select('id, name').order('name', { ascending: true }));
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }

  if (!deal) return null;

  async function handleSave() {
    const wrong = currencies ? moneyProblem(money) : null;
    if (wrong) { setError(wrong); return; }
    setSaving(true);
    setError(null);
    try {
      let finalContactId: string | null = contactId || null;

      // Only touches the shared resolver if the user actually typed a new
      // person here — this is what makes "add a contact mid-deal" land in
      // `contacts` instead of only ever living on this one deal row.
      if (addingContact && newContactName.trim()) {
        const { contact } = await findOrCreateContact({
          name: newContactName,
          email: newContactEmail,
          companyId: deal.company_id || null,
          status: 'active',
        });
        finalContactId = contact.id;
      }

      const payload: any = {
        ...(currencies ? dealMoneyRow(money, value) : { value: Number(value) || 0 }),
        stage,
        campaign_id: campaignId || null,
        contact_id: finalContactId,
        updated_at: new Date().toISOString(),
        ...(forecast ? forecastValues(closeDate, probability) : {}),
      };
      const stageType = stageByKey(stages, stage)?.type;
      if (competitionColumns) Object.assign(payload, competitionRow(competition, stageType));
      if (stageType === 'won' || stageType === 'lost') payload.closed_at = new Date().toISOString();
      const { error: updateErr } = await supabase.from('deals').update(payload).eq('id', deal.id);
      if (updateErr) throw updateErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to update deal:', err);
      setError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(hasBin ? 'Delete this deal? It stays in the recycle bin for 30 days.' : 'Delete this deal? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      if (await moveToBin(supabase, 'deals', [deal.id])) { onSaved(); onClose(); return; }
      const { error: deleteErr } = await supabase.from('deals').delete().eq('id', deal.id);
      if (deleteErr) throw deleteErr;
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete deal:', err);
      setError(err.message || 'Could not delete the deal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!deal} onClose={onClose} title={deal.title}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
        {deal.companies?.name || '—'} · {deal.contacts?.name || 'No contact yet'}
      </div>

      {currencies ? <DealMoneyFields money={money} onMoney={setMoney} value={value} onValue={setValue} /> : (
        <>
          <label style={fieldLabelStyle}>Value ({activeCurrencyCode()})</label>
          <input style={fieldInputStyle} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
        </>
      )}

      <label style={fieldLabelStyle}>Stage</label>
      <select style={fieldInputStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
        <StageOptions stages={stages} />
      </select>

      {competitionColumns && <DealCompetitionFields value={competition} onChange={setCompetition} stageType={stageByKey(stages, stage)?.type} />}
      {forecast && <ForecastFields closeDate={closeDate} probability={probability} stageChance={stageProbability(stages.find((s) => s.key === stage), stages)} onCloseDate={setCloseDate} onProbability={setProbability} />}


      <label style={fieldLabelStyle}>Campaign</label>
      <select style={fieldInputStyle} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
        <option value="">No campaign</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <label style={fieldLabelStyle}>Contact</label>
      {!addingContact ? (
        <>
          <select style={fieldInputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setAddingContact(true); setContactId(''); }}
            style={{ ...ghostBtnStyle, marginBottom: '1.1rem', padding: '0.5rem 0.8rem' }}
          >
            + New Contact
          </button>
        </>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.9rem', marginBottom: '1.1rem' }}>
          <label style={fieldLabelStyle}>Name</label>
          <input style={fieldInputStyle} value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="e.g. Jane Doe" />
          <label style={fieldLabelStyle}>Email</label>
          <input style={{ ...fieldInputStyle, marginBottom: '0.6rem' }} value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="jane@acme.com" />
          <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.6rem' }}>
            If this person already exists (matched by email or name), we'll link to them instead of creating a duplicate.
          </div>
          <button type="button" style={ghostBtnStyle} onClick={() => setAddingContact(false)}>Cancel</button>
        </div>
      )}

      <AssigneeSelect table="deals" recordId={deal.id} value={deal.assignee_id ?? null} onChanged={onSaved} />
      <TagsEditor table="deals" recordId={deal.id} tags={deal.tags} onChanged={onSaved} />
      <CustomFieldsSection entityType="deal" entity={deal} onChanged={onSaved} />
      <TasksSection dealId={deal.id} />

      {['won', 'lost'].includes(stageByKey(stages, deal.stage)?.type || '') && <DealSurvey dealId={deal.id} contactId={deal.contact_id} />}

      {quotes && (
        <Link to={`/crm/quotes?deal=${deal.id}`} onClick={onClose} style={{ display: 'inline-block', marginBottom: 12, fontSize: '0.65rem', color: 'var(--purple)' }}>Make a quote for this deal</Link>
      )}
      <ActivityTimeline dealId={deal.id} contactId={deal.contact_id} />

      <AttachmentsSection entityType="deal" entityId={deal.id} />
      <RecordHistory
        table="deals"
        recordId={deal.id}
        refreshKey={[deal.updated_at, deal.assignee_id, deal.stage, deal.value, deal.title].join('|')}
      />

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
        <OwnerOnly permission="delete">
          <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDelete} disabled={saving}>
            Delete
          </button>
        </OwnerOnly>
        <OwnerOnly permission="edit">
          <button type="button" style={primaryBtnStyle} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </OwnerOnly>
      </div>
    </Modal>
  );
}