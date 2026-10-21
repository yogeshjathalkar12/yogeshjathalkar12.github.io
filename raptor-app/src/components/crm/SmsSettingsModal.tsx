import { smsApi } from '../../pages/connections/hub/env';
import SmsSettingsPanel from '../../pages/connections/hub/SmsSettingsPanel';
import Modal from './Modal';

// The SMS dialog on the CRM pipeline: the same settings as the SMS tab under Channels, in a window. What each mode does, and the
// safeguards, are in db/migrations/2026-10-21_sms.sql.
export type SmsMode = 'off' | 'semi' | 'auto';

interface Props { open: boolean; onClose: () => void; onSaved: () => void }

export default function SmsSettingsModal({ open, onClose, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Text message (SMS) automation" width={640}>
      {open ? <SmsSettingsPanel api={smsApi} onSaved={onSaved} onCancel={onClose} /> : null}
    </Modal>
  );
}
