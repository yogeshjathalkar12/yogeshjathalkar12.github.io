export interface ImportFieldSchema {
  key: string;
  label: string;
  required?: boolean;
}

export const TICKETS_IMPORT_SCHEMA: ImportFieldSchema[] = [
  { key: 'title', label: 'Ticket Title', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'status', label: 'Status (open, in_progress, resolved, closed)', required: false },
  { key: 'priority', label: 'Priority (low, medium, high, urgent)', required: false },
  { key: 'category', label: 'Category', required: false },
];