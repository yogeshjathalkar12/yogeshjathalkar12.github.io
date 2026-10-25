import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import BulkImportModal from '../../components/crm/BulkImportModal';
import ExportButton from '../../components/crm/ExportButton';
import LiveCallPanel from '../../components/crm/LiveCallPanel';
import PipelineStagesModal from '../../components/crm/PipelineStagesModal';
import DealDetailModal from '../../components/crm/DealDetailModal';
import OutreachSettingsModal, { type OutreachMode } from '../../components/crm/OutreachSettingsModal';
import WhatsAppSettingsModal, { type WhatsAppMode } from '../../components/crm/WhatsAppSettingsModal';
import SmsSettingsModal, { type SmsMode } from '../../components/crm/SmsSettingsModal';
import { smsApi } from '../connections/hub/env';
import { dispatchCrmWhatsApp } from '../../lib/whatsappDispatch';
import OwnerOnly from '../../components/OwnerOnly';
import AssigneeFilter, { applyAssigneeFilter, useAssigneeFilter } from '../../components/crm/AssigneeFilter';
import { useMemberLabels } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import NewDealModal from '../../components/crm/NewDealModal';
import { DEALS_IMPORT_SCHEMA } from '../../lib/importSchema';
import { startCall } from '../../lib/calls';
import { useAuth } from '../../hooks/AuthContext';
import { type PipelineStage, loadPipelineStages, stageByKey } from '../../lib/pipelineStages';
import { formatCurrency } from '../../lib/crmHelpers';
import { checkTeamOverlap, noteTeamContact, reachedOut } from '../../lib/teamContactGuard';

// What the email on a deal card is doing. Statuses come from deal_outreach (see db/migrations/2026-10-14_crm_outreach.sql).
interface DealEmail { status: string; error: string | null; }
const EMAIL_STATUS: Record<string, { text: string; color: string }> = {
  queued: { text: 'Waiting for your desktop app', color: 'var(--dim)' },
  accepted: { text: 'In your desktop app\'s send queue', color: 'var(--purple)' },
  sent: { text: 'Email sent', color: 'var(--green, #22c55e)' },
  replied: { text: 'Replied', color: 'var(--green, #22c55e)' },
  bounced: { text: 'Email bounced', color: 'var(--red)' },
  failed: { text: 'Email failed', color: 'var(--red)' },
  cancelled: { text: 'Email not sent', color: 'var(--dim)' },
  expired: { text: 'Email not sent (expired)', color: 'var(--red)' },
  skipped: { text: 'Email not sent', color: '#eab308' },
};
const EMAIL_IN_PROGRESS_OR_DONE = ['queued', 'accepted', 'sent', 'replied', 'bounced'];
const MODE_LABEL: Record<OutreachMode, string> = { off: 'Off', semi: 'Semi-automatic', auto: 'Automatic' };

// What the WhatsApp message on a deal card is doing (table deal_whatsapp, see db/migrations/2026-10-14_crm_whatsapp.sql).
interface DealWa { status: string; error: string | null; }
const WA_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: 'Queued, sending shortly', color: 'var(--dim)' },
  sending: { text: 'Sending…', color: 'var(--purple)' },
  sent: { text: 'Message sent', color: 'var(--green, #22c55e)' },
  delivered: { text: 'Delivered', color: 'var(--green, #22c55e)' },
  read: { text: 'Read', color: 'var(--green, #22c55e)' },
  replied: { text: 'Replied', color: 'var(--green, #22c55e)' },
  failed: { text: 'Message failed', color: 'var(--red)' },
  skipped: { text: 'Message not sent', color: '#eab308' },
};
const WA_IN_PROGRESS_OR_DONE = ['pending', 'sending', 'sent', 'delivered', 'read', 'replied'];

// The same for the text message (SMS) on a deal card (table deal_sms, see db/migrations/2026-10-21_sms.sql).
interface DealSms { status: string; error: string | null; }
const SMS_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: 'Queued, sending shortly', color: 'var(--dim)' },
  sending: { text: 'Sending…', color: 'var(--purple)' },
  sent: { text: 'Text sent', color: 'var(--green, #22c55e)' },
  delivered: { text: 'Text delivered', color: 'var(--green, #22c55e)' },
  replied: { text: 'Replied', color: 'var(--green, #22c55e)' },
  failed: { text: 'Text failed', color: 'var(--red)' },
  skipped: { text: 'Text not sent', color: '#eab308' },
};
const SMS_IN_PROGRESS_OR_DONE = ['pending', 'sending', 'sent', 'delivered', 'replied'];

export default function CrmPipeline() {
  const { session } = useAuth();
  // One company, one team: before a message goes out, a teammate who already reached out to the company (or who owns it) is mentioned and the person
  // confirms. Advisory only: if it cannot be checked, the message goes ahead as before (lib/teamContactGuard.ts).
  const confirmTeamOverlap = async (deal: any): Promise<boolean> => {
    const why = await checkTeamOverlap(supabase, deal?.companies?.name, session?.user?.id);
    return !why || window.confirm(why.message);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const [assigneeFilter, setAssigneeFilter] = useAssigneeFilter('pipeline');
  const [deals, setDeals] = useState<any[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [activeDeal, setActiveDeal] = useState<any | null>(null);
  const [activeCall, setActiveCall] = useState<{
    prospectCompany: string; contactPhone: string | null; contactEmail: string | null;
  } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [callingDealId, setCallingDealId] = useState<string | null>(null);

  // Email on the cards: Off / Semi-automatic (an Email button next to Call) / Automatic (sent when the deal is added).
  const [outreachMode, setOutreachMode] = useState<OutreachMode>('off');
  const [dealEmail, setDealEmail] = useState<Record<string, DealEmail>>({});
  const [showOutreach, setShowOutreach] = useState(false);
  const [emailingDealId, setEmailingDealId] = useState<string | null>(null);

  // The same three modes for WhatsApp: a WhatsApp button next to Call and Email.
  const [waMode, setWaMode] = useState<WhatsAppMode>('off');
  const [dealWa, setDealWa] = useState<Record<string, DealWa>>({});
  const [showWaSettings, setShowWaSettings] = useState(false);
  const [wasendingDealId, setWaSendingDealId] = useState<string | null>(null);

  // And for text messages: an SMS button next to Call, Email and WhatsApp.
  const [smsMode, setSmsMode] = useState<SmsMode>('off');
  const [dealSms, setDealSms] = useState<Record<string, DealSms>>({});
  const [showSmsSettings, setShowSmsSettings] = useState(false);
  const [smsSendingDealId, setSmsSendingDealId] = useState<string | null>(null);

  // The board's own scrollbar sits at the very bottom, far from view on a long
  // board, so a mirrored one is shown on top and the two are kept in step.
  const boardRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const syncing = useRef(false);
  const mirrorScroll = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => setBoardScrollWidth(board.scrollWidth > board.clientWidth ? board.scrollWidth : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board);
    Array.from(board.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [stages, deals, loading]);

  const handleCall = async (e: React.MouseEvent, deal: any) => {
    e.stopPropagation();
    if (!deal.contacts?.id || !session?.access_token) return;
    setCallError(null);
    setCallingDealId(deal.id);
    try {
      const result = await startCall(session.access_token, deal.contacts.id);
      setActiveCall({
        prospectCompany: result.prospect_company,
        contactPhone: result.contact_phone,
        contactEmail: result.contact_email,
      });
    } catch (err: any) {
      // Most likely cause: the desktop app isn't running on this machine —
      // that's where the mic/call backend actually lives.
      setCallError(err.message || 'Could not start call. Is the desktop app running?');
    } finally {
      setCallingDealId(null);
    }
  };

  async function fetchOutreach() {
    try {
      const [settings, rows] = await Promise.all([
        supabase.from('crm_outreach_settings').select('mode').maybeSingle(),
        supabase.from('deal_outreach').select('deal_id, status, error'),
      ]);
      if (settings.error || rows.error) return; // the database part is not installed yet: the board works as before
      setOutreachMode((settings.data?.mode as OutreachMode) || 'off');
      setDealEmail(Object.fromEntries((rows.data || []).map((r: any) => [r.deal_id, { status: r.status, error: r.error }])));
    } catch {
      /* leave the cards as they were */
    }
  }

  async function fetchWhatsApp() {
    try {
      const [settings, rows] = await Promise.all([
        supabase.from('crm_whatsapp_settings').select('mode').maybeSingle(),
        supabase.from('deal_whatsapp').select('deal_id, status, error'),
      ]);
      if (settings.error || rows.error) return; // the database part is not installed yet: the board works as before
      setWaMode((settings.data?.mode as WhatsAppMode) || 'off');
      setDealWa(Object.fromEntries((rows.data || []).map((r: any) => [r.deal_id, { status: r.status, error: r.error }])));
    } catch {
      /* leave the cards as they were */
    }
  }

  const handleWhatsApp = async (e: React.MouseEvent, deal: any) => {
    e.stopPropagation();
    setCallError(null);
    if (!(await confirmTeamOverlap(deal))) return;
    setWaSendingDealId(deal.id);
    try {
      const { data, error } = await supabase.rpc('crm_wa_request', { p_deal_id: deal.id });
      if (error) throw error;
      if (data?.status === 'skipped' && data.error) setCallError(data.error);
      if (reachedOut(data?.status)) await noteTeamContact(supabase, deal?.companies?.name, 'whatsapp');
      await fetchWhatsApp();
      if (data?.status === 'pending') {
        await dispatchCrmWhatsApp(); // send it now rather than waiting for the next check
        await fetchWhatsApp();
      }
    } catch (err: any) {
      setCallError(err.message || 'Could not queue the WhatsApp message.');
    } finally {
      setWaSendingDealId(null);
    }
  };

  async function fetchSms() {
    try {
      const [settings, rows] = await Promise.all([
        supabase.from('sms_settings').select('mode').maybeSingle(),
        supabase.from('deal_sms').select('deal_id, status, error'),
      ]);
      if (settings.error || rows.error) return; // the database part is not installed yet: the board works as before
      setSmsMode((settings.data?.mode as SmsMode) || 'off');
      setDealSms(Object.fromEntries((rows.data || []).map((r: any) => [r.deal_id, { status: r.status, error: r.error }])));
    } catch {
      /* leave the cards as they were */
    }
  }

  const handleSms = async (e: React.MouseEvent, deal: any) => {
    e.stopPropagation();
    setCallError(null);
    if (!(await confirmTeamOverlap(deal))) return;
    setSmsSendingDealId(deal.id);
    try {
      const data = await smsApi.requestDeal(deal.id);
      if (data.status === 'skipped' && data.error) setCallError(data.error);
      if (reachedOut(data.status)) await noteTeamContact(supabase, deal?.companies?.name, 'sms');
      await fetchSms();
      if (data.status === 'pending') {
        await smsApi.dispatch(); // send it now rather than waiting for the next check
        await fetchSms();
      }
    } catch (err: any) {
      setCallError(err.message || 'Could not queue the text message.');
    } finally {
      setSmsSendingDealId(null);
    }
  };

  const handleEmail = async (e: React.MouseEvent, deal: any) => {
    e.stopPropagation();
    setCallError(null);
    if (!(await confirmTeamOverlap(deal))) return;
    setEmailingDealId(deal.id);
    try {
      const { data, error } = await supabase.rpc('crm_outreach_request', { p_deal_id: deal.id });
      if (error) throw error;
      if (data?.status === 'skipped' && data.error) setCallError(data.error);
      if (reachedOut(data?.status)) await noteTeamContact(supabase, deal?.companies?.name, 'email');
      await fetchOutreach();
    } catch (err: any) {
      setCallError(err.message || 'Could not queue the email.');
    } finally {
      setEmailingDealId(null);
    }
  };

  // Initial load and Realtime Subscription
  useEffect(() => {
    fetchDeals();
    fetchStages();
    fetchOutreach();
    fetchWhatsApp();
    fetchSms();

    // Replicate the realtime listener from crm.html
    const channel = supabase.channel('crm-deals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchDeals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_stages' }, () => {
        fetchStages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_outreach' }, () => {
        fetchOutreach();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_whatsapp' }, () => {
        fetchWhatsApp();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_sms' }, () => {
        fetchSms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchStages() {
    try {
      setStages(await loadPipelineStages());
    } catch (error) {
      console.error('Failed to load pipeline stages:', error);
    }
  }

  async function fetchDeals() {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*, contacts(id, name, email, phone), companies(id, name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals(data || []);
      // keep an open deal's detail view in step with what was just saved/assigned
      setActiveDeal((prev: any) => (prev ? (data || []).find((d: any) => d.id === prev.id) ?? prev : prev));
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
    }
  }

  // GlobalSearch.tsx navigates here with ?open=<id> - once the real fetch
  // resolves, open that deal and drop the param.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || deals.length === 0) return;
    const match = deals.find((d) => d.id === openId);
    if (match) setActiveDeal(match);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  const assigneeLabels = useMemberLabels(deals.map((d) => d.assignee_id));

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    const dealToUpdate = deals.find(d => d.id === dealId);

    if (!dealToUpdate || dealToUpdate.stage === newStage) return;

    // 1. Optimistic UI update (feels instant to the user)
    const previousDeals = [...deals];
    setDeals(deals.map(deal =>
      deal.id === dealId ? { ...deal, stage: newStage } : deal
    ));

    // 2. Exact backend update from crm.html logic
    try {
      const payload: any = { stage: newStage, updated_at: new Date().toISOString() };
      const newStageType = stageByKey(stages, newStage)?.type;
      if (newStageType === 'won' || newStageType === 'lost') {
        payload.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', dealId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to move deal:', error);
      // Revert if the server fails
      setDeals(previousDeals);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Syncing pipeline...</div>;
  }

  const shownDeals = applyAssigneeFilter(deals, assigneeFilter, session?.user?.id);

  // Flattened rows for export — deals carries nested companies/contacts objects,
  // ExportButton needs plain key/value pairs.
  const exportRows = deals.map((d) => ({
    title: d.title,
    value: d.value,
    stage: d.stage,
    company: d.companies?.name || '',
    contact: d.contacts?.name || '',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBottom: '1rem', flexShrink: 0 }}>
        <AssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} />
        <ExportButton
          data={exportRows}
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'value', label: 'Value' },
            { key: 'stage', label: 'Stage' },
            { key: 'company', label: 'Company' },
            { key: 'contact', label: 'Contact' },
          ]}
          filename="deals"
        />
        <button
          onClick={() => setShowOutreach(true)}
          title="Email automation for the pipeline"
          style={{
            background: outreachMode === 'off' ? 'transparent' : 'rgba(168,85,247,0.12)', color: outreachMode === 'off' ? 'var(--dim)' : 'var(--white)',
            border: `1px solid ${outreachMode === 'off' ? 'var(--border)' : 'var(--purple)'}`, padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          ✉ Email: {MODE_LABEL[outreachMode]}
        </button>
        <button
          onClick={() => setShowWaSettings(true)}
          title="WhatsApp automation for the pipeline"
          style={{
            background: waMode === 'off' ? 'transparent' : 'rgba(168,85,247,0.12)', color: waMode === 'off' ? 'var(--dim)' : 'var(--white)',
            border: `1px solid ${waMode === 'off' ? 'var(--border)' : 'var(--purple)'}`, padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          ◉ WhatsApp: {MODE_LABEL[waMode]}
        </button>
        <button
          onClick={() => setShowSmsSettings(true)}
          title="Text message (SMS) automation for the pipeline"
          style={{
            background: smsMode === 'off' ? 'transparent' : 'rgba(168,85,247,0.12)', color: smsMode === 'off' ? 'var(--dim)' : 'var(--white)',
            border: `1px solid ${smsMode === 'off' ? 'var(--border)' : 'var(--purple)'}`, padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          ✆ SMS: {MODE_LABEL[smsMode]}
        </button>
        <OwnerOnly><button
          onClick={() => setShowImport(true)}
          style={{
            background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Bulk Import
        </button></OwnerOnly>
        <OwnerOnly permission="manage_pipeline"><button
          onClick={() => setShowStageManager(true)}
          style={{
            background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Customize Pipeline
        </button></OwnerOnly>
        <OwnerOnly permission="create"><button
          onClick={() => setShowNewDeal(true)}
          style={{
            background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.6rem 1.1rem',
            borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          + New Deal
        </button></OwnerOnly>
      </div>

      <div
        ref={topBarRef}
        className="pipeline-board pipeline-board-top"
        onScroll={() => mirrorScroll(topBarRef.current, boardRef.current)}
        style={{ overflowX: 'auto', overflowY: 'hidden', display: boardScrollWidth ? 'block' : 'none', marginBottom: '0.6rem', position: 'sticky', top: 64, zIndex: 5, background: 'var(--black)', paddingBottom: '0.3rem' }}
      >
        <div style={{ width: boardScrollWidth, height: 1 }} />
      </div>
      <div ref={boardRef} onScroll={() => mirrorScroll(boardRef.current, topBarRef.current)} className="pipeline-board pipeline-board-main" style={{ display: 'flex', gap: '1.4rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, minHeight: 0, minWidth: 0 }}>
        {stages.map(stage => {
          const stageDeals = shownDeals.filter(d => d.stage === stage.key);
          const stageValue = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

          return (
            <div
              key={stage.key}
              onDrop={(e) => handleDrop(e, stage.key)}
              onDragOver={handleDragOver}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                minWidth: '280px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '6px'
              }}
            >
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--white)' }}>
                  {stage.label}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--dim)', background: 'var(--surface)', padding: '0.2rem 0.5rem', border: '1px solid var(--border)' }}>
                  {stageDeals.length} · {formatCurrency(stageValue)}
                </span>
              </div>

              <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {stageDeals.length === 0 ? (
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', textAlign: 'center', padding: '1rem 0' }}>No deals here</div>
                ) : (
                  stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onClick={() => setActiveDeal(deal)}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '1.1rem',
                        cursor: 'grab',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', color: stage.type === 'won' ? 'var(--green)' : 'inherit' }}>
                        {formatCurrency(deal.value)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--white)', margin: '0.3rem 0' }}>{deal.title}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.5rem' }}>{deal.companies?.name || '—'}</div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginBottom: deal.contacts?.id ? '0.5rem' : 0 }}>
                        {deal.contacts?.name || 'No contact'}
                      </div>
                      {deal.assignee_id && (
                        <div style={{ fontSize: '0.5rem', color: 'var(--purple)', margin: '0 0 0.4rem' }}>&rarr; {shortName(assigneeLabels[deal.assignee_id])}</div>
                      )}
                      {deal.contacts?.id && (() => {
                        const email = dealEmail[deal.id];
                        const canEmail = outreachMode !== 'off' && !(email && EMAIL_IN_PROGRESS_OR_DONE.includes(email.status));
                        const hasAddress = !!deal.contacts?.email;
                        const info = email ? EMAIL_STATUS[email.status] : null;
                        const wa = dealWa[deal.id];
                        const canWa = waMode !== 'off' && !(wa && WA_IN_PROGRESS_OR_DONE.includes(wa.status));
                        const hasPhone = !!deal.contacts?.phone;
                        const waInfo = wa ? WA_STATUS[wa.status] : null;
                        const sms = dealSms[deal.id];
                        const canSms = smsMode !== 'off' && !(sms && SMS_IN_PROGRESS_OR_DONE.includes(sms.status));
                        const smsInfo = sms ? SMS_STATUS[sms.status] : null;
                        return (
                          <>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                onClick={(e) => handleCall(e, deal)}
                                disabled={callingDealId === deal.id}
                                style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', flex: 1 }}
                              >
                                {callingDealId === deal.id ? 'Connecting…' : 'Call'}
                              </button>
                              {canEmail && (
                                <button
                                  onClick={(e) => handleEmail(e, deal)}
                                  disabled={emailingDealId === deal.id || !hasAddress}
                                  title={hasAddress ? 'Send your email template to this contact' : 'This contact has no email address'}
                                  style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', flex: 1 }}
                                >
                                  {emailingDealId === deal.id ? 'Queuing…' : email ? 'Retry email' : 'Email'}
                                </button>
                              )}
                              {canWa && (
                                <button
                                  onClick={(e) => handleWhatsApp(e, deal)}
                                  disabled={wasendingDealId === deal.id || !hasPhone}
                                  title={hasPhone ? 'Send your WhatsApp template to this contact' : 'This contact has no phone number'}
                                  style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', flex: 1 }}
                                >
                                  {wasendingDealId === deal.id ? 'Queuing…' : wa ? 'Retry WhatsApp' : 'WhatsApp'}
                                </button>
                              )}
                              {canSms && (
                                <button
                                  onClick={(e) => handleSms(e, deal)}
                                  disabled={smsSendingDealId === deal.id || !hasPhone}
                                  title={hasPhone ? 'Send your text message to this contact' : 'This contact has no phone number'}
                                  style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', flex: 1 }}
                                >
                                  {smsSendingDealId === deal.id ? 'Queuing…' : sms ? 'Retry SMS' : 'SMS'}
                                </button>
                              )}
                            </div>
                            {info && (
                              <div style={{ fontSize: '0.52rem', color: info.color, marginTop: '0.45rem', lineHeight: 1.5 }}>
                                ✉ {info.text}{email.error && !['sent', 'replied', 'queued', 'accepted'].includes(email.status) ? `: ${email.error}` : ''}
                              </div>
                            )}
                            {smsInfo && sms && (
                              <div style={{ fontSize: '0.52rem', color: smsInfo.color, marginTop: '0.35rem', lineHeight: 1.5 }}>
                                ✆ {sms.status === 'pending' && sms.error ? `Waiting: ${sms.error}` : smsInfo.text}
                                {sms.error && !['pending', 'sent', 'delivered', 'replied'].includes(sms.status) ? `: ${sms.error}` : ''}
                              </div>
                            )}
                            {waInfo && (
                              <div style={{ fontSize: '0.52rem', color: waInfo.color, marginTop: '0.35rem', lineHeight: 1.5 }}>
                                ◉ {wa.status === 'pending' && wa.error ? `Waiting: ${wa.error}` : waInfo.text}
                                {wa.error && !['pending', 'sent', 'delivered', 'read', 'replied'].includes(wa.status) ? `: ${wa.error}` : ''}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {callError && (
        <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', background: '#2d0d0d', border: '1px solid #4d1a1a', color: '#ff8888', padding: '0.8rem 1rem', borderRadius: '4px', fontSize: '0.65rem', zIndex: 1000 }}>
          {callError}
        </div>
      )}

      {activeCall && session?.access_token && (
        <LiveCallPanel
          accessToken={session.access_token}
          prospectCompany={activeCall.prospectCompany}
          contactPhone={activeCall.contactPhone}
          contactEmail={activeCall.contactEmail}
          onClose={() => setActiveCall(null)}
        />
      )}

      <OutreachSettingsModal open={showOutreach} onClose={() => setShowOutreach(false)} onSaved={fetchOutreach} />
      <SmsSettingsModal open={showSmsSettings} onClose={() => setShowSmsSettings(false)} onSaved={fetchSms} />
      <WhatsAppSettingsModal open={showWaSettings} onClose={() => setShowWaSettings(false)} onSaved={fetchWhatsApp} />

      <BulkImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        tableName="deals"
        schema={DEALS_IMPORT_SCHEMA}
        onImported={fetchDeals}
      />

      <PipelineStagesModal
        open={showStageManager}
        onClose={() => setShowStageManager(false)}
        stages={stages}
        dealCountByStage={stages.reduce((acc: Record<string, number>, s) => {
          acc[s.key] = deals.filter((d) => d.stage === s.key).length;
          return acc;
        }, {})}
        onChanged={async () => { await fetchStages(); await fetchDeals(); }}
      />

      <DealDetailModal deal={activeDeal} onClose={() => setActiveDeal(null)} onSaved={fetchDeals} />

      <NewDealModal open={showNewDeal} onClose={() => setShowNewDeal(false)} onCreated={fetchDeals} />
    </div>
  );
}