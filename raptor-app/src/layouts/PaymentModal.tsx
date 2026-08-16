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
  credits?: number;
}

interface VerifyResponse {
  status: string;
  message: string;
  credits?: number;
  credits_added?: number;
}

// Keep in sync with TOPUP_PACKS in billing_router.py -- these values are
// for display only, the backend re-derives price from the pack id itself
// so nothing here is trusted for the actual charge.
const TOPUP_PACKS = [
  { id: 'small', credits: 100, price: 700, perCredit: '₹7/credit' },
  { id: 'medium', credits: 250, price: 1500, perCredit: '₹6/credit' },
  { id: 'large', credits: 500, price: 2500, perCredit: '₹5/credit' },
] as const;

type PackId = (typeof TOPUP_PACKS)[number]['id'];
type LoadingKey = PackId | 'pro' | null;

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
  const [loading, setLoading] = useState<LoadingKey>(null);

  const isPro = plan.toLowerCase() === 'pro';

  /**
   * Shared checkout runner. `createBody` is optional since /create-order
   * (Pro upgrade) takes no body, while /create-topup-order needs { pack }.
   */
  const runCheckout = async (opts: {
    createUrl: string;
    verifyUrl: string;
    createBody?: Record<string, unknown>;
    description: string;
    successMessage: (result: VerifyResponse) => string;
    loadingKey: PackId | 'pro';
  }) => {
    setLoading(opts.loadingKey);
    try {
      const scriptOk = await loadRazorpayScript();
      if (!scriptOk) {
        showToast('Could not load the payment gateway — check your connection', 'error');
        setLoading(null);
        return;
      }

      const order = await authedFetch<CreateOrderResponse>(opts.createUrl, {
        method: 'POST',
        skipCreditsSync: true,
        ...(opts.createBody ? { body: JSON.stringify(opts.createBody) } : {}),
      });

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Raptor',
        description: opts.description,
        theme: { color: '#7c3aed' },
        handler: async (response) => {
          try {
            const result = await authedFetch<VerifyResponse>(opts.verifyUrl, {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            // Pulls fresh plan + totalCredits from Supabase, not just the
            // credits number -- syncFromServer alone won't flip plan to
            // "Pro" or bump totalCredits after a top-up.
            await refresh();
            showToast(opts.successMessage(result), 'success');
            onClose();
          } catch (err) {
            showToast(
              err instanceof Error ? err.message : 'Payment verification failed',
              'error'
            );
          } finally {
            setLoading(null);
          }
        },
        modal: {
          ondismiss: () => setLoading(null),
        },
      });

      rzp.on('payment.failed', () => {
        showToast('Payment failed — please try again', 'error');
        setLoading(null);
      });

      rzp.open();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start checkout', 'error');
      setLoading(null);
    }
  };

  const handlePayPro = () =>
    runCheckout({
      createUrl: `${RAPTOR_API_URL}/api/billing/create-order`,
      verifyUrl: `${RAPTOR_API_URL}/api/billing/verify-payment`,
      description: 'Pro Plan Upgrade',
      successMessage: (r) => r.message || 'Upgraded to Pro!',
      loadingKey: 'pro',
    });

  const handleBuyPack = (packId: PackId) =>
    runCheckout({
      createUrl: `${RAPTOR_API_URL}/api/billing/create-topup-order`,
      verifyUrl: `${RAPTOR_API_URL}/api/billing/verify-topup-payment`,
      createBody: { pack: packId },
      description: 'Credit Top-up',
      successMessage: (r) => r.message || `Added ${r.credits_added ?? ''} credits!`,
      loadingKey: packId,
    });

  return (
    <div className="billing-modal-overlay" onClick={onClose}>
      <div className="billing-modal" onClick={(e) => e.stopPropagation()}>
        <button className="billing-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {isPro ? (
          <>
            <div className="billing-modal-badge">Pro Plan</div>
            <h2 className="billing-modal-title">Buy More Credits</h2>
            <p className="billing-modal-desc">
              Loyalty pricing for Pro members — cheaper per credit the more you buy.
            </p>
            <div className="billing-pack-list">
              {TOPUP_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  className="billing-pack-option"
                  disabled={loading !== null}
                  onClick={() => handleBuyPack(pack.id)}
                >
                  <div className="billing-pack-credits">{pack.credits} credits</div>
                  <div className="billing-pack-price">₹{pack.price.toLocaleString('en-IN')}</div>
                  <div className="billing-pack-rate">{pack.perCredit}</div>
                  {loading === pack.id && (
                    <div className="billing-pack-loading">Opening checkout…</div>
                  )}
                </button>
              ))}
            </div>
            <div className="billing-modal-secure">🔒 Secured by Razorpay</div>
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
            <button className="billing-modal-pay-btn" onClick={handlePayPro} disabled={loading !== null}>
              {loading === 'pro' ? 'Opening checkout…' : 'Pay with Razorpay'}
            </button>
            <div className="billing-modal-secure">🔒 Secured by Razorpay</div>
          </>
        )}
      </div>
    </div>
  );
}