import GuidePanel, { type GuideSection } from '../../components/guide/GuidePanel';

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    label: 'How it works',
    heading: 'How it works',
    intro: (
      <>
        You connect your own Meta WhatsApp Cloud API number — no reseller, no shared number, no shared
        reputation. Meta enforces a hard rule that shapes everything here: any message you send to start
        or restart a conversation (a broadcast, a sequence step) must use a <strong>pre-approved template</strong>,
        never free-form text. Free text is only allowed as a reply inside the 24-hour window after the
        contact last messaged you — an auto-reply from a trigger, an AI flow, or a manual reply from the
        Inbox.
      </>
    ),
  },
  {
    id: 'meta-setup',
    label: '1. Meta setup',
    heading: '1. Set up your Meta WhatsApp Business app',
    steps: [
      { title: 'Create a Meta app', body: 'In Meta Business Manager / developers.facebook.com, create an app with the WhatsApp product added, on your own Business Manager account.' },
      { title: 'Get a phone number', body: 'Add and verify a phone number for WhatsApp Business in that app (a test number works for trying this out; a real number needs its own verification).' },
      { title: 'Create and approve templates', body: <>Any broadcast or sequence message needs a template approved in Meta first — <strong>WhatsApp Manager → Message Templates</strong>. Approval can take from minutes to a day. Plan this before you plan a send date.</> },
      { title: 'Collect three values', body: <>From the app: the <strong>Phone Number ID</strong>, the <strong>WhatsApp Business Account (WABA) ID</strong>, and a permanent <strong>Access Token</strong> (System User token, not a 24-hour test token).</> },
    ],
  },
  {
    id: 'connect',
    label: '2. Connect in Raptor',
    heading: '2. Connect the account in Raptor',
    steps: [
      { title: 'Go to the Connection tab', body: 'Under WhatsApp Automation.' },
      { title: 'Fill in the form', body: 'Label, Phone Number ID, WABA ID, Access Token, and — optional — a Commerce Catalog ID if you plan to send product messages.' },
      { title: 'Connect', body: 'Your token is encrypted before it is stored.' },
    ],
    note: <>Sending also starts small and grows: it ramps by about 5/day toward your account's target. Meta separately enforces its own tier based on your number's quality rating (starting around 250 unique customers/24h and growing as quality holds) — Meta can reject sends past its own tier regardless of what Raptor's local limit says.</>,
  },
  {
    id: 'webhook',
    label: '3. Connect the webhook',
    heading: '3. Connect the inbound webhook (required for replies and triggers)',
    intro: 'Without this step, you can send broadcasts, but you will never see a reply, and triggers and flows will never fire.',
    steps: [
      { title: 'In your Meta app', body: 'Go to WhatsApp → Configuration → Webhook.' },
      { title: 'Callback URL', body: 'The backend\'s WhatsApp webhook endpoint (ask whoever runs the server for the exact URL — it is account-specific).' },
      { title: 'Verify token', body: 'Must match the value the server has configured for webhook verification.' },
      { title: 'Subscribe to messages', body: 'Subscribe the webhook to the "messages" field so inbound texts, button taps and delivery statuses all arrive.' },
    ],
  },
  {
    id: 'broadcast',
    label: '4. Send a broadcast',
    heading: '4. Send your first broadcast',
    steps: [
      { title: 'Broadcasts tab → New Broadcast', body: 'Name it, and enter the exact approved template name (case-sensitive) plus its language code (defaults to en_US).' },
      { title: 'Audience tag', body: 'Optional — leave blank to send to everyone; set a tag to target a subset of contacts.' },
      { title: 'Send Batch Now', body: 'Sends the first batch immediately (5 at a time); the rest follows on the scheduler\'s ticks, within your daily cap and business hours.' },
    ],
    note: 'A template name that is not approved, or a language mismatch, is the most common reason a broadcast shows failures.',
  },
  {
    id: 'more-tools',
    label: 'Sequences, Triggers, Flows, Inbox',
    heading: 'Sequences, Triggers, AI Flows and the Inbox',
    steps: [
      { title: 'Sequences', body: 'A drip of template messages, each with its own wait in hours. Enroll by audience tag or contact selection.' },
      { title: 'Triggers', body: <>Auto-reply to an inbound keyword. Reply kinds: plain text, buttons, a list, a catalog link, a single product, or a product list (the last two need a Catalog ID set on the account). Match type: <em>contains</em> or <em>exact</em>.</> },
      { title: 'AI Flows', body: 'A multi-step conversation starting from an entry keyword, with an optional AI Reply node (needs a system prompt) for open-ended steps.' },
      { title: 'Inbox', body: 'See every conversation, reply manually (only works inside the 24-hour window), and mark conversations Resolved or Reopen them.' },
      { title: 'Opt-out', body: '"stop", "unsubscribe" or "opt out" from a contact suppresses them automatically — no further sends to that number.' },
    ],
  },
  {
    id: 'crm-link',
    label: 'CRM linkage',
    heading: 'How this connects to the CRM',
    intro: <>A WhatsApp conversation only appears on a CRM contact's timeline if that phone number is already linked to a CRM contact record. A cold broadcast to a number with no matching contact sends fine, but leaves no trace on any contact's timeline — by design, to keep cold-outreach noise out of the CRM.</>,
  },
];

export default function WhatsappGuide() {
  return (
    <GuidePanel
      eyebrow="WhatsApp Automation · Guide"
      title="Set up and use WhatsApp automation"
      intro="Meta's rules shape this more than any other channel — read the template requirement in section 1 before you plan a campaign."
      sections={SECTIONS}
    />
  );
}
