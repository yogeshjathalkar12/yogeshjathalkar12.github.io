interface ContactData {
  status?: string;
  email?: string;
  phone?: string;
  companies?: { name?: string };
}

interface InteractionData {
  type: string;
}

interface DealData {
  stage: string;
  value?: number;
}

export function calculateLeadScore(
  contact: ContactData,
  interactions: InteractionData[] = [],
  deals: DealData[] = []
): number {
  let score = 0;

  // Profile Completeness (+10 each)
  if (contact.email) score += 10;
  if (contact.phone) score += 10;
  if (contact.companies?.name) score += 15;

  // Contact Status
  if (contact.status === 'hot') score += 30;
  if (contact.status === 'active') score += 15;

  // Interaction Engagement
  interactions.forEach((i) => {
    if (i.type === 'meeting') score += 20;
    if (i.type === 'call') score += 10;
    if (i.type === 'email') score += 5;
    if (i.type === 'note') score += 2;
  });

  // Deals Progression
  deals.forEach((d) => {
    if (d.stage === 'won') score += 50;
    if (d.stage === 'negotiation') score += 30;
    if (d.stage === 'meeting') score += 20;
    if (d.stage === 'lead') score += 10;
  });

  return score;
}