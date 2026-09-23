import GuidePanel, { type GuideSection } from '../../components/guide/GuidePanel';

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    label: 'How it works',
    heading: 'How it works',
    intro: (
      <>
        Email automation is a <strong>Pro</strong> feature. You connect <strong>your own mailbox</strong> (Google Workspace, Microsoft 365, Zoho or any
        provider that gives you SMTP details). Every email goes out from that mailbox, at a human pace,
        under your name. Contacts reach the email system through a <strong>CRM broadcast</strong>, a{' '}
        <strong>sequence enrolment</strong> or a <strong>trigger event</strong>. A scheduler calls this
        server every 1–3 minutes to send the next batch, respecting your daily limit, business hours
        (09:00–18:59 India time) and the suppression list. Every non-transactional email must include
        an unsubscribe link — Raptor refuses to send one that doesn't.
      </>
    ),
  },
  {
    id: 'who',
    label: 'Your responsibilities',
    heading: 'You are responsible for who you email',
    intro: (
      <>
        Raptor sends what you tell it to, to whom you tell it to. It does not check whether recipients
        have agreed to hear from you, and it cannot make an email lawful. Before connecting a mailbox you
        confirm you understand this.
      </>
    ),
    table: {
      headers: ['Lower risk', 'Higher risk'],
      rows: [
        ['Your customers and past customers', 'Contacts bought or scraped in bulk'],
        ['People who asked for a demo, quote or call', 'Anyone with no connection to your business'],
        ['Businesses you have a real, relevant reason to write to, with an honest sender and an easy opt-out', 'Guessed email addresses'],
      ],
    },
    note: <>Laws differ by country: India (DPDP Act and IT rules), the EU (GDPR and ePrivacy) and the US (CAN-SPAM) treat unsolicited email very differently. If you are unsure, take advice before a campaign. Separately, Gmail, Microsoft and your mail host can limit or suspend a mailbox that sends unwanted mail, and that risk is yours.</>,
  },
  {
    id: 'connect',
    label: '1. Connect a mailbox',
    heading: '1. Connect your mailbox',
    steps: [
      { title: 'Get your SMTP details', body: <>From your mail provider: the mail server (for example smtp.gmail.com), the port (587 for STARTTLS or 465 for SSL/TLS), and a password. Gmail and Microsoft accounts need an <strong>app password</strong>, not your normal one.</> },
      { title: 'Go to the Connection tab', body: 'Enter a label, your From email and From name, the mail server, connection type, port and password.' },
      { title: 'Press Test connection', body: 'It logs in without sending anything, so you know the details are right before you save.' },
      { title: 'Confirm your responsibilities and connect', body: 'Tick the confirmation box and press Connect. Your password is encrypted before it is stored.' },
      { title: 'Check Domain Health', body: 'On the Analytics tab, confirm SPF, DKIM and DMARC are found for your sending domain. A separate sending domain protects your main one.' },
    ],
    note: <>A new mailbox starts at 10 emails a day and grows by 5 a day up to 20. This is deliberately human-paced and cannot be turned off. Gmail and Microsoft flag mailboxes that jump in volume, often far below their published limits.</>,
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
      { title: 'Fill in the broadcast', body: <>Pick your mailbox, the segment, a subject, and the body. <strong>The body box is plain HTML</strong> — write paragraphs as <code>{'<p>text</p>'}</code>, not plain line breaks.</> },
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
      { title: 'Provider limits', body: 'If your mailbox reports "limit reached," a campaign pauses for about 15 minutes and retries automatically. Sequences, triggers and follow-ups currently treat that as a failed send for that one recipient.' },
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
