// The places in the shared CRM screens where the PC app adds what only it can do (AI research and pitches from the local engine, Live
// Copilot calls, telling the learning engine how a deal ended, running automations from the PC). On the web every one of these shows
// nothing and does nothing. The PC app has its own copy of this file: raptor-ui/src/webapp/shims/desktop.js (scripts/port_web_screens.mjs
// points the generated screens at it), so a name added here must be added there too.
import type { ReactNode } from 'react';
import type { UiColumn } from '../components/crm/ViewTable';

export interface DesktopRecord {
  kind: 'deal' | 'contact' | 'company';
  record: any;
  contacts?: any[];                 // a company's people
  onChanged?: () => void;
}

/** Inside a record's window. */
export function DesktopRecordTools(_props: DesktopRecord): ReactNode { return null; }

/** Extra list columns. */
export function desktopColumns(_kind: 'contact' | 'company'): UiColumn<any>[] { return []; }

/** Under the automation rules. */
export function DesktopAutomationTools(_props: { onChanged: () => void }): ReactNode { return null; }

/** On the analytics page. */
export function DesktopOutreachNumbers(): ReactNode { return null; }

/** A deal reached a won or lost stage. */
export function reportDealOutcome(_deal: any, _stageType: string | undefined): void {}

/** True when the PC app has opened its own call screen for this person, so the web call must not start as well. */
export function openCallScreen(_contactId: string): boolean { return false; }
