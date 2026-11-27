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
    label: 'Day-to-day',
    heading: 'Day-to-day: contacts, pipeline, tasks',
    steps: [
      { title: 'Add a contact', body: 'Contacts → + New Contact: name, email, phone, job title, company, status. Open a contact to edit it, add tags, see its history and make tasks.' },
      { title: 'Work the pipeline', body: 'Pipeline shows deals by stage. Open a deal to change its stage, value, expected close date, chance of closing, tags and contact. A deal can be in another currency (see “Money”).' },
      { title: 'Several pipelines', body: 'Pipeline → Pipelines adds more (for example Sales and Renewals), each with its own stages.' },
      { title: 'Notes and history', body: 'Contacts, deals and companies each show their notes, emails, calls and meetings, and who changed what.' },
      { title: 'Tasks and reminders', body: 'Tasks lists what is due, with a calendar view. Raptor shows a notice when a task falls due; tick “Email me a daily summary” to also get a morning email of what is overdue or due that day.' },
      { title: 'Find things in long lists', body: 'Contacts and Companies let you choose columns, sort, filter and select many rows at once (assign, tag, change status, delete). Long lists are shown 100 at a time.' },
      { title: 'Deleted by mistake?', body: 'Recycle bin keeps deleted contacts, companies and deals for 30 days.' },
    ],
  },
  {
    id: 'leads',
    label: 'Getting leads in',
    heading: 'Web forms, booking links, scores and assignment',
    steps: [
      { title: 'Web forms', body: 'Web forms → + New form, then copy its link or the website code. Each message becomes a contact and a follow-up task. A form never creates a deal and never emails the visitor.' },
      { title: 'Booking links', body: 'Booking → + New booking page: your days, hours and meeting length. Visitors pick a free time. Choose per page whether they get emails: none, from Raptor’s address, or from your own mailbox through the PC app. Your Google or Outlook busy times are not checked.' },
      { title: 'Calendar link', body: 'Tasks or Booking → Calendar link shows your Raptor meetings and tasks in Google Calendar or Outlook. It goes one way and refreshes on their schedule.' },
      { title: 'Lead scoring', body: 'Contacts → Scoring rules: add points for things such as a job title or recent contact. The Score column shows the total; tick it under Columns if you have chosen your own columns.' },
      { title: 'Assignment rules', body: 'Contacts → Assignment rules hands new web-form and API leads to people in turn. After an import you can share the new contacts out the same way.' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    heading: 'Forecast, quotes and currencies',
    steps: [
      { title: 'Forecast', body: 'Forecast adds up open deals by the month they are expected to close, weighted by their chance. A deal with no chance of its own uses its stage’s.' },
      { title: 'Quotes', body: 'Quotes → + New quote. Add lines by hand or from Products, then “Save and mark sent” and send the customer its link. They can print, accept or decline it. Raptor does not email the quote for you, and “tax” is just the percentage you type.' },
      { title: 'Your details on quotes', body: 'The owner or an admin sets the business name, address, terms and number prefix under Quotes → Your business details.' },
      { title: 'Other currencies', body: 'Pipeline → Currencies: type exchange rates. A deal in another currency counts in totals at its rate; “Apply to open deals” updates open ones. Rates are not fetched automatically.' },
    ],
  },
  {
    id: 'reports',
    label: 'Dashboard & reports',
    heading: 'Your own reports',
    steps: [
      { title: 'Build a report', body: 'Dashboard → + New report: choose what to count or add up, group it (and split it a second way), set a period and conditions, and pick bars, line, pie, table or one number.' },
      { title: 'Several dashboards', body: 'Type a new dashboard name while saving a report. “Print or save as PDF” prints the dashboard you are looking at.' },
      { title: 'Who sees what', body: 'The team shares the list of reports; the numbers cover only the records each person may see.' },
      { title: 'Fixed reports', body: 'Analytics shows pipeline value and conversion; Reports shows what each team member did in a period.' },
    ],
  },
  {
    id: 'automations',
    label: 'Automations & API',
    heading: 'Automations, tickets, marketing and the API',
    steps: [
      { title: 'Automations', body: 'A rule says when (a contact or deal is added, a deal reaches a stage or is won or stalls, a task is overdue, a contact goes quiet or reaches a score) and then what (note, task, notification, tag, status, assign, webhook). Rules run about once an hour when the hourly job is switched on.' },
      { title: 'Webhooks and Zapier or Make', body: 'The webhook action sends the record’s details to an address you give, such as a Zapier or Make “catch hook”.' },
      { title: 'API', body: 'API → Make key lets your own programs read and write contacts, companies, deals, tasks and notes. Records written this way never message anyone by themselves.' },
      { title: 'Tickets', body: 'Tickets tracks support issues: who handles each, when it is due (set by its priority) and your team’s notes.' },
      { title: 'Marketing tab', body: 'Build an audience segment (by contact status and minimum lead score), then Send Broadcast — this is the fastest way to send a real email to a group of CRM contacts. It needs a connected email sending account (see the Email guide).' },
    ],
  },
  {
    id: 'migrate',
    label: 'Switch from your old CRM',
    heading: 'Bring your data in from another CRM or a spreadsheet',
    intro: <>Use an export file from HubSpot, Zoho, another CRM or your own spreadsheet (Excel or CSV). Raptor does not connect to another CRM directly.</>,
    steps: [
      { title: 'Export from your current CRM', body: 'Use its export for contacts, companies and deals. Keep the header row.' },
      { title: 'Import', body: 'Contacts, Companies or Pipeline → Import. Choose one or several files; every sheet is read together.' },
      { title: 'Check the matching', body: 'Raptor matches your columns to its fields and shows why. Change anything that is wrong; columns without a match can become your own fields.' },
      { title: 'Preview', body: 'Before anything is written you see what will be added, what already exists (empty fields are filled) and which rows have problems. The same company written twice becomes one.' },
      { title: 'Undo', body: 'Every import can be undone from Import history. Records you have since worked on stay.' },
    ],
    note: <><strong>An import never sends email, WhatsApp or text messages by itself</strong>, even in Automatic mode.</>,
  },
];

export default function CrmGuide() {
  return (
    <GuidePanel
      eyebrow="CRM · Guide"
      title="Set up and use the CRM"
      intro="Day-to-day use, getting leads in, quotes and reports, and moving your data in from another CRM."
      sections={SECTIONS}
    />
  );
}
