import { useState } from 'react';
import { useAuthedFetch } from '../hooks/useAuthedFetch';
import { useCredits } from '../hooks/CreditsContext';
import { useToast } from '../hooks/ToastContext';
import { RAPTOR_API_URL } from '../lib/config';
import './PaymentModal.css';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  theme?: { color: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

interface VerifyResponse {
  status: string;
  message: string;
  credits: number;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface PaymentModalProps {
  plan: string;
  onClose: () => void;
}

export function PaymentModal({ plan, onClose }: PaymentModalProps) {
  const { authedFetch } = useAuthedFetch();
  const { refresh } = useCredits();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const isPro = plan.toLowerCase() === 'pro';

  const handlePay = async () => {
    setLoading(true);
    try {
      const scriptOk = await loadRazorpayScript();
      if (!scriptOk) {
        showToast('Could not load the payment gateway — check your connection', 'error');
        setLoading(false);
        return;
      }

      // create-order takes no body, just the bearer token
      const order = await authedFetch<CreateOrderResponse>(
        `${RAPTOR_API_URL}/api/billing/create-order`,
        { method: 'POST', skipCreditsSync: true }
      );

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Raptor',
        description: 'Pro Plan Upgrade',
        theme: { color: '#7c3aed' },
        handler: async (response) => {
          try {
            const result = await authedFetch<VerifyResponse>(
              `${RAPTOR_API_URL}/api/billing/verify-payment`,
              {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              }
            );
            // Pulls fresh plan + totalCredits from Supabase, not just the
            // credits number -- syncFromServer alone won't flip plan to "Pro".
            await refresh();
            showToast(result.message || 'Upgraded to Pro!', 'success');
            onClose();
          } catch (err) {
            showToast(
              err instanceof Error ? err.message : 'Payment verification failed',
              'error'
            );
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      rzp.on('payment.failed', () => {
        showToast('Payment failed — please try again', 'error');
        setLoading(false);
      });

      rzp.open();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start checkout', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="billing-modal-overlay" onClick={onClose}>
      <div className="billing-modal" onClick={(e) => e.stopPropagation()}>
        <button className="billing-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {isPro ? (
          <>
            <div className="billing-modal-badge">Pro Plan</div>
            <h2 className="billing-modal-title">Credit top-ups coming soon</h2>
            <p className="billing-modal-desc">
              You're already on Pro. Buying extra credits on top of your plan isn't wired up
              on the backend yet.
            </p>
          </>
        ) : (
          <>
            <div className="billing-modal-badge">Upgrade</div>
            <h2 className="billing-modal-title">Go Pro</h2>
            <p className="billing-modal-desc">
              Unlock 500 credits and priority access to every Raptor tool.
            </p>
            <div className="billing-modal-price">
              ₹4,999 <span>/ one-time</span>
            </div>
            <button className="billing-modal-pay-btn" onClick={handlePay} disabled={loading}>
              {loading ? 'Opening checkout…' : 'Pay with Razorpay'}
            </button>
            <div className="billing-modal-secure">🔒 Secured by Razorpay</div>
          </>
        )}
      </div>
    </div>
  );
}