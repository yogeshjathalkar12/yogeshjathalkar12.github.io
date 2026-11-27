// Deals in other currencies (db/migrations/2026-11-29_g_currencies.sql). A deal's value is always in the organization's own currency;
// the database works it out as amount x rate.

export interface Rate { code: string; rate: number | string }
export interface DealMoney { currency: string; amount: string; rate: string }       // currency '' = the organization's own

export const ownMoney: DealMoney = { currency: '', amount: '', rate: '' };

export const moneyOf = (deal: { currency?: string | null; amount?: number | string | null; fx_rate?: number | string | null }): DealMoney =>
  (deal.currency ? { currency: deal.currency, amount: String(deal.amount ?? ''), rate: String(Number(deal.fx_rate ?? 0) || '') } : ownMoney);

const positive = (text: string) => { const n = Number(text); return text.trim() !== '' && Number.isFinite(n) ? n : null; };

/** The value in the organization's currency, or null while the amount or rate is missing. */
export function converted(money: DealMoney): number | null {
  const amount = positive(money.amount), rate = positive(money.rate);
  if (amount === null || rate === null || amount < 0 || rate <= 0) return null;
  return Math.round(amount * rate * 100) / 100;
}

export function moneyProblem(money: DealMoney): string | null {
  if (!money.currency) return null;
  const amount = positive(money.amount);
  if (amount === null || amount < 0) return `Type the amount in ${money.currency}.`;
  const rate = positive(money.rate);
  if (rate === null || rate <= 0) return `Type what 1 ${money.currency} is worth.`;
  return null;
}

/** The columns to save: with a foreign currency the value follows from it; otherwise the typed value, and nothing foreign. */
export function dealMoneyRow(money: DealMoney, typedValue: string) {
  if (!money.currency) return { value: Number(typedValue) || 0, currency: null, amount: null, fx_rate: null };
  return { value: converted(money) ?? 0, currency: money.currency, amount: Number(money.amount), fx_rate: Number(money.rate) };
}

/** The money after another currency was chosen: the saved rate is filled in. */
export function chooseCurrency(money: DealMoney, code: string, rates: Rate[]): DealMoney {
  if (!code) return ownMoney;
  const saved = rates.find((r) => r.code === code);
  return { currency: code, amount: money.amount, rate: saved ? String(Number(saved.rate)) : '' };
}
