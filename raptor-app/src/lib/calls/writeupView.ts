// How the AI write-up's checked points are shown (the PC app writes them: raptor/calls/writeup.py). Used by the web and the PC screens.

export interface Point { text: string; quote: string; line: number; by: 'us' | 'them' | '' }
export interface Writeup {
  agreed_step: Point | null;
  objections: Point[];
  buying_signals: Point[];
  promises: Point[];
  open_questions: Point[];
  unverified: string[];
  not_in?: string;            // the language that was chosen, when the model wrote in another
  step_replaced?: string[];   // what the model's next step named that nobody said, when the agreed words were put in its place
}
export interface Section { key: string; title: string; items: Point[] }

export const BY_LABELS: Record<Point['by'], string> = { us: 'We', them: 'They', '': '' };

/** The headed lists to show, empty ones left out. */
export function writeupSections(w: Writeup | null | undefined): Section[] {
  if (!w) return [];
  const list: Section[] = [
    { key: 'step', title: 'Agreed next step', items: w.agreed_step ? [w.agreed_step] : [] },
    { key: 'promises', title: 'Who said they would do what', items: w.promises || [] },
    { key: 'objections', title: 'Their concerns', items: w.objections || [] },
    { key: 'signals', title: 'Signs of interest', items: w.buying_signals || [] },
    { key: 'questions', title: 'Questions left open', items: w.open_questions || [] },
  ];
  return list.filter((s) => s.items.length > 0);
}

/** What the reader should be warned about: a day or number nobody said, a summary not in the chosen language. '' when nothing. */
export function unverifiedNote(w: Writeup | null | undefined): string {
  const found = w?.unverified || [];
  const notes = [];
  if (found.length) notes.push(`Check before acting: the summary mentions ${found.join(', ')}, which nobody said on the call.`);
  if (w?.step_replaced?.length) notes.push(`The next step is what was agreed on the call: the AI's own version named ${w.step_replaced.join(', ')}, which nobody said.`);
  if (w?.not_in) notes.push(`The AI did not write this summary in ${w.not_in}. The quoted words below are as spoken.`);
  return notes.join(' ');
}
