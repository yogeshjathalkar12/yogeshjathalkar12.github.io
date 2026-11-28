// The words for the plans sold online. Prices come from the server; nothing here decides a charge.
export interface ShopStatus { open: boolean; tax_percent: number; plans: Array<{ plan: string; months: number; price: number; total: number }> }
export interface PlanOffer { key: string; plan: string; months: number; label: string; priceText: string }

const rupees = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function planChoices(shop: ShopStatus): PlanOffer[] {
  return shop.plans.map((p) => ({
    key: `${p.plan}:${p.months}`,
    plan: p.plan,
    months: p.months,
    label: `Raptor ${p.plan}, ${p.months === 12 ? '1 year' : `${p.months} month${p.months === 1 ? '' : 's'}`}`,
    priceText: shop.tax_percent > 0 ? `${rupees(p.total)} (${rupees(p.price)} plus ${shop.tax_percent}% tax)` : rupees(p.total),
  }));
}
