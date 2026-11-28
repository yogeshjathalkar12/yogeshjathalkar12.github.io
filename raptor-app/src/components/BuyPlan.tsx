// Buying Reach or Core online (server: raptor/plan_checkout.py). Shown only to the organization's owner and only while the server says the
// shop is open; otherwise nothing appears. The price and everything about the payment is decided by the server.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { planChoices, type PlanOffer, type ShopStatus } from '../lib/planShop';
import { useOrg } from '../hooks/OrgContext';

const API_BASE = import.meta.env.VITE_RAPTOR_API_URL || 'https://websites-api-5wmu.onrender.com';
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const loadCheckout = () => new Promise<boolean>((resolve) => {
  if ((window as any).Razorpay) { resolve(true); return; }
  const script = document.createElement('script');
  script.src = CHECKOUT_SCRIPT;
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

async function post(path: string, body: unknown): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/api/raptor/plan-checkout${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify(body),
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof answer.detail === 'string' ? answer.detail : 'The payment service did not answer. Try again in a minute.');
  return answer;
}

export default function BuyPlan({ onBought }: { onBought?: () => void }) {
  const { isOwner } = useOrg();
  const [shop, setShop] = useState<ShopStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!isOwner) return;
    fetch(`${API_BASE}/api/raptor/plan-checkout/status`).then((r) => (r.ok ? r.json() : null)).then(setShop).catch(() => {});
  }, [isOwner]);
  if (!isOwner || !shop?.open) return null;

  const buy = async (offer: PlanOffer) => {
    setBusy(offer.key);
    setError('');
    setDone('');
    try {
      if (!(await loadCheckout())) throw new Error('Could not load the payment window. Check your connection.');
      const order = await post('/order', { plan: offer.plan, months: offer.months });
      await new Promise<void>((resolve, reject) => {
        const checkout = new (window as any).Razorpay({
          key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id, name: 'Raptor', description: offer.label,
          handler: async (paid: Record<string, string>) => {
            try {
              await post('/verify', paid);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error('')) },
        });
        checkout.on?.('payment.failed', (r: any) => reject(new Error(r?.error?.description || 'The payment did not go through.')));
        checkout.open();
      });
      setDone(`Thank you. ${offer.label} is on your account.`);
      onBought?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1.2rem 1.4rem', background: 'var(--surface)', marginBottom: '1.4rem' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 6 }}>Buy or renew</div>
      {planChoices(shop).map((offer) => (
        <div key={offer.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0.4rem 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--white)' }}>{offer.label}<span style={{ display: 'block', color: 'var(--dim)', fontSize: '0.62rem' }}>{offer.priceText}</span></span>
          <button type="button" disabled={Boolean(busy)} onClick={() => buy(offer)} style={{ background: 'transparent', border: '1px solid var(--purple)', color: 'var(--white)', borderRadius: 4, padding: '0.35rem 0.9rem', fontSize: '0.64rem', cursor: 'pointer' }}>
            {busy === offer.key ? 'Opening…' : 'Buy'}
          </button>
        </div>
      ))}
      {error && <div role="alert" style={{ fontSize: '0.65rem', color: 'var(--red)', marginTop: 8 }}>{error}</div>}
      {done && <div role="status" style={{ fontSize: '0.65rem', color: 'var(--green, #22c55e)', marginTop: 8 }}>{done}</div>}
      <div style={{ fontSize: '0.62rem', color: 'var(--dim)', marginTop: 8 }}>
        One payment for the period chosen: nothing renews by itself. Buying the same plan again adds the time after your current end date. For SDR, Brain,
        extra users or a change of plan before yours ends, write to us.
      </div>
    </div>
  );
}
