export interface PredictiveScoreResult {
  score: number;
  reasoning: string;
}

// 1. Predictive Lead Scoring using AI
export async function calculatePredictiveScore(
  _contactName: string,
  _company: string,
  status: string,
  interactionsSummary: string,
  dealSummary: string
): Promise<PredictiveScoreResult> {
  let score = 50;
  let reasoning = 'Standard profile engagement.';

  if (interactionsSummary.includes('meeting') || dealSummary.includes('negotiation')) {
    score += 35;
    reasoning = 'High engagement: Active meetings and negotiation stages indicate high intent to purchase.';
  } else if (status === 'hot') {
    score += 25;
    reasoning = 'Contact marked as Hot status with recent interaction activity.';
  } else if (status === 'cold') {
    score -= 15;
    reasoning = 'Low activity and cold status reducing conversion likelihood.';
  }

  return { score: Math.min(100, Math.max(0, score)), reasoning };
}

// 2. Auto-generate Email Response
export async function generateAiEmailResponse(
  contactName: string,
  topic: string,
  tone: 'professional' | 'casual' | 'persuasive' = 'professional'
): Promise<string> {
  const templates: Record<string, string> = {
    professional: `Hi ${contactName},\n\nThank you for reaching out regarding ${topic}. I wanted to check in and see if you have time for a quick 10-minute sync this week to discuss how we can assist.\n\nBest regards,\nSales Team`,
    casual: `Hey ${contactName},\n\nHope you're having a great week! Following up on ${topic}—let me know if you'd like to jump on a quick call to catch up.\n\nCheers,\nSales Team`,
    persuasive: `Hi ${contactName},\n\nI noticed your team is working on ${topic}. We recently helped a client in your space increase efficiency by 30%. Would you be open to reviewing a quick 5-minute proposal?\n\nBest,\nSales Team`,
  };

  return templates[tone] || templates.professional;
}

// 3. Smart Meeting Summarizer
export async function summarizeMeetingNotes(rawNotes: string): Promise<{
  summary: string;
  actionItems: string[];
}> {
  if (!rawNotes.trim()) {
    return { summary: 'No notes provided.', actionItems: [] };
  }

  const lines = rawNotes.split('\n').filter((l) => l.trim().length > 0);
  const actionItems = lines.filter(
    (l) => l.toLowerCase().includes('todo') || l.toLowerCase().includes('action') || l.toLowerCase().includes('send')
  );

  return {
    summary: `Meeting focused on key discussion points: ${lines.slice(0, 2).join(' ')}`,
    actionItems: actionItems.length > 0 ? actionItems : ['Follow up with client in 3 days.'],
  };
}