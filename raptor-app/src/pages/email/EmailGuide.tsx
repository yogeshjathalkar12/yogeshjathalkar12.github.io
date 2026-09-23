import GuidePanel, { type GuideSection } from '../../components/guide/GuidePanel';

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    label: 'How it works',
    heading: 'How it works',
    intro: (
      <>
        You connect your own Resend account (or bring your own mailbox once that option is
        switched on for this server). Contacts reach the email system through a <strong>CRM broadcast</strong>,
        a <strong>sequence enrolment</strong> or a <strong>trigger event</strong> — there is no separate
        "add contact" screen inside Email itself. A scheduler calls this server every 1–3 minutes to send
        the next batch, respecting your daily limit, business hours (09:00–18:59 India time) and the
        suppression list. Every non-transactional email must include an unsubscribe link — Raptor refuses
        to send one that doesn't.
      </>
    ),
  },
  {
    id: 'who',
    label: 'Who you can email',
    heading: 'Who you can email',
    intro: (
      <>
        Resend requires every recipient to have opted in. It bans cold outreach, purchased lists and
        scraped contact data, and can close an account without warning if complaints go above 0.08% or
        bounces above 4%.
      </>
    ),
    table: {
      headers: ['Fine to email', 'Not fine'],
      rows: [
        ['Your customers', 'Prospects found by scraping or searching'],
        ['Newsletter or website sign-ups', 'Bought or rented lists'],
        ['People who asked for a demo, quote or call', 'Anyone who never asked to hear from you'],
      ],
    },
  },
  {
    id: 'connect',
    label: '1. Connect an account',
    heading: '1. Connect a sending account',
    steps: [
      { title: 'Go to the Connection tab', body: 'Choose Resend, or your own mailbox if SMTP is enabled here.' },
      { title: 'Resend', body: <>Enter a label, your From email (must be on a domain verified in Resend), From name, and your Resend API key. Pick your plan — Free (100 emails/day) or paid.</> },
      { title: 'Your own mailbox (if available)', body: <>Enter the mail server, port, connection type (STARTTLS or SSL/TLS) and password — Gmail and Microsoft accounts usually need an app password. Press <strong>Test connection</strong> before saving; it logs in without sending anything.</> },
      { title: 'Check Domain Health', body: 'On the Analytics tab, confirm SPF, DKIM and DMARC all show as found before you send anything real.' },
    ],
    note: <>New accounts start small and grow automatically: Resend Free ramps to 100/day, Resend paid to 300/day, a mailbox to 40/day — about 5 more each day. This protects your sender reputation; you cannot turn it off.</>,
  },
  {
    id: 'contacts',
    label: '2. Get contacts in',
    heading: '2. Get contacts into the email system',
    intro: <>There is no import screen in Email itself. Contacts arrive one of three ways:</>,
    steps: [
      { title: 'A broadcast from the CRM (easiest)', body: <>CRM → Marketing → build an audience segment (by status/lead score) → Send Broadcast. This is the fastest route to a first real send.</> },
      { title: 'Sequence enrolment', body: 'On a sequence card, press Enroll Contacts and type emails or an audience tag.' },
      { title: 'A trigger event', body: 'An external event (signup, purchase) posted to your account\'s webhook creates the contact and can fire an email or start a sequence.' },
    ],
    note: <>Only the email address carries over automatically. <code>{'{{first_name}}'}</code> and <code>{'{{company}}'}</code> will show as blank or "there" unless the contact already exists in the email system with those fields set.</>,
  },
  {
    id: 'send',
    label: '3. Send your first email',
    heading: '3. Send your first broadcast',
    steps: [
      { title: 'CRM → Marketing', body: 'Create an audience segment (a status and, optionally, a minimum lead score).' },
      { title: 'Fill in the broadcast', body: <>Pick the sending account, the segment, a subject, and the body. <strong>The body box is plain HTML</strong> — write paragraphs as <code>{'<p>text</p>'}</code>, not plain line breaks.</> },
      { title: 'Send Broadcast', body: 'Raptor adds an unsubscribe footer automatically if you forgot one, sends the first batch immediately, and the rest follows on the next scheduler ticks.' },
    ],
  },
  {
    id: 'more-tools',
    label: 'Campaigns, sequences, triggers',
    heading: 'Campaigns, Sequences, Triggers and Follow-ups',
    steps: [
      { title: 'Campaigns', body: <>One-off sends with a full block editor, spintax (<code>{'{Hi|Hello|Hey}'}</code>), merge tags, and optional A/B testing. <strong>Send Now</strong> sends one batch of 3 immediately; the scheduler continues it after that.</> },
      { title: 'Segments', body: 'Filter by tag or email engagement (opened/clicked), for use inside a campaign.' },
      { title: 'Sequences', body: 'A multi-step drip, each step with its own delay in hours, with optional branching on open/click.' },
      { title: 'Triggers', body: <>Send an email — or enrol someone into a sequence — when an event arrives at your account's webhook. Copy the <code>X-Webhook-Secret</code> when you generate it; it is shown once.</> },
      { title: 'Follow-ups', body: 'Branch off an existing campaign: "if not opened after 48h, send this." Each rule fires exactly once per recipient.' },
    ],
  },
  {
    id: 'limits',
    label: 'Limits to know',
    heading: 'Worth knowing before you rely on this',
    steps: [
      { title: 'Sending hours', body: 'Fixed at 09:00–18:59 India time. Not adjustable from this screen yet.' },
      { title: 'Personalisation', body: 'Limited to the email address by default — see the note in section 2.' },
      { title: 'Provider limits', body: 'If Resend (or your mailbox) reports "limit reached," a campaign pauses for about 15 minutes and retries automatically. Sequences, triggers and follow-ups currently treat that as a failed send for that one recipient.' },
      { title: 'Transactional flag', body: 'Skips the daily cap, business hours and the unsubscribe requirement — use only for genuine service messages (a receipt, an OTP), never for marketing.' },
    ],
  },
];

export default function EmailGuide() {
  return (
    <GuidePanel
      eyebrow="Email Automation · Guide"
      title="Set up and use email automation"
      intro="A working path from zero to a real send, using only what is live in this build today."
      sections={SECTIONS}
    />
  );
}
