import GuidePanel, { type GuideSection } from '../../components/guide/GuidePanel';

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    label: 'How it works',
    heading: 'How it works',
    intro: (
      <>
        Contacts, Companies and Deals are the backbone every other module reads from: email
        broadcasts, WhatsApp conversation linkage, and the desktop app's "promote to CRM" all write
        into these same tables.
      </>
    ),
  },
  {
    id: 'daily-use',
    label: 'Contacts, Pipeline, Tickets',
    heading: 'Day-to-day: Contacts, Pipeline, Tickets',
    steps: [
      { title: 'Add a contact', body: 'Contacts → + New Contact: name, email, phone, company, status (cold, active, hot).' },
      { title: 'Move a deal', body: 'Pipeline shows deals by stage (lead, meeting, negotiation, won, lost) — open one to update its stage, value or notes.' },
      { title: 'Log activity', body: 'Activity records what has happened across contacts, and Tickets tracks support/service issues tied to a contact or company.' },
      { title: 'Export anytime', body: 'Every list screen has an Export CSV button next to its "+ New" button — it exports exactly what is currently loaded on screen.' },
    ],
  },
  {
    id: 'migrate',
    label: 'Switch from your old CRM',
    heading: 'Move your contacts and deals in from another CRM',
    intro: <>Works with any CRM export — HubSpot, Zoho, Pipedrive, Salesforce, a spreadsheet, anything that can produce a CSV. Raptor does not connect to another CRM's API directly; you export a file there, then import it here.</>,
    steps: [
      {
        title: 'Export from your current CRM',
        body: (
          <>
            Use its contacts/companies/deals export (usually under Settings → Export, or a list view's
            Export button). Keep the header row. If your CRM lets you choose columns, include at minimum
            name and email for contacts, and title/value/stage for deals.
          </>
        ),
      },
      {
        title: 'Clean the file first',
        body: (
          <>
            <strong>Deduplicate before you import.</strong> Importing does a plain insert with no
            duplicate check — running the same file twice, or importing two exports that overlap,
            creates duplicate rows. Open the CSV in a spreadsheet and remove duplicate emails first.
          </>
        ),
      },
      {
        title: 'Import contacts',
        body: 'Contacts → Bulk Import → choose the file. The first row must be headers.',
      },
      {
        title: 'Map the columns',
        body: (
          <>
            Raptor guesses the mapping from your header names and shows it for you to confirm or fix —
            your old CRM's exact column names don't need to match Raptor's. Required: <strong>name</strong>.
            Optional: email, phone, status (must be exactly <code>cold</code>, <code>active</code> or{' '}
            <code>hot</code> — anything else fails validation for that row and you'll need to fix it in
            the source file, or leave the column unmapped and set status manually afterwards).
          </>
        ),
      },
      {
        title: 'Preview, then import',
        body: 'Every row is validated and shown before anything is written — rows with errors are listed individually and skipped; everything else imports.',
      },
      {
        title: 'Import deals the same way',
        body: (
          <>
            Pipeline → Bulk Import. Required: <strong>title</strong>. Optional: value (a number), stage
            (<code>lead</code>, <code>meeting</code>, <code>negotiation</code>, <code>won</code> or{' '}
            <code>lost</code>).
          </>
        ),
      },
    ],
    note: (
      <>
        <strong>Bulk-imported deals and contacts are not linked to each other or to a company
        automatically.</strong> The CSV import has no "Company Name" column and does not resolve one to
        a company record the way the New Contact / New Deal forms do by hand. After a bulk import, open
        each deal and set its contact and company, or add contacts manually one at a time when you need
        that link from the start.
      </>
    ),
  },
  {
    id: 'automations',
    label: 'Automations & Marketing',
    heading: 'Automations and the Marketing broadcast tool',
    steps: [
      { title: 'Automations tab', body: 'Rule-based actions on your CRM data — a status change or a new deal can trigger a webhook or another action.' },
      { title: 'Marketing tab', body: 'Build an audience segment (by contact status and minimum lead score), then Send Broadcast — this is the fastest way to send a real email to a group of CRM contacts. It needs a connected email sending account (see the Email guide).' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    heading: 'Analytics',
    intro: 'Pipeline value by stage, conversion between stages, and activity volume over time, computed from your Contacts, Deals and Activity data.',
  },
];

export default function CrmGuide() {
  return (
    <GuidePanel
      eyebrow="CRM · Guide"
      title="Set up and use the CRM"
      intro="Day-to-day use, plus a full walkthrough for moving your contacts and deals in from another CRM."
      sections={SECTIONS}
    />
  );
}
