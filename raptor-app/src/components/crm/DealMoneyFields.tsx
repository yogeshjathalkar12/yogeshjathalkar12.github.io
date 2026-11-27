import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { activeCurrencyCode, formatCurrency } from '../../lib/currency';
import { CURRENCIES } from '../../lib/quotes';
import { type DealMoney, type Rate, chooseCurrency, converted } from '../../lib/fx';
import { fieldInputStyle, fieldLabelStyle } from './Modal';

// The value of a deal: in your own currency, or in another one with the rate it was agreed at.

export default function DealMoneyFields({ money, onMoney, value, onValue, required }: {
  money: DealMoney; onMoney: (m: DealMoney) => void; value: string; onValue: (v: string) => void; required?: boolean;
}) {
  const [rates, setRates] = useState<Rate[]>([]);
  useEffect(() => {
    Promise.resolve(supabase.from('currency_rates').select('code, rate')).then(({ data }) => setRates((data || []) as Rate[]));
  }, []);
  const own = activeCurrencyCode();
  const codes = Array.from(new Set([...rates.map((r) => r.code), ...CURRENCIES, ...(money.currency ? [money.currency] : [])])).filter((c) => c !== own);
  const result = converted(money);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 110px' }}>
          <label style={fieldLabelStyle} htmlFor="deal-currency">Currency</label>
          <select id="deal-currency" style={fieldInputStyle} value={money.currency} onChange={(e) => onMoney(chooseCurrency(money, e.target.value, rates))}>
            <option value="">{own}</option>
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!money.currency ? (
          <div style={{ flex: '1 1 160px' }}>
            <label style={fieldLabelStyle} htmlFor="deal-value">Value ({own})</label>
            <input id="deal-value" style={fieldInputStyle} type="number" min="0" value={value} onChange={(e) => onValue(e.target.value)} required={required} placeholder="0" />
          </div>
        ) : (
          <>
            <div style={{ flex: '1 1 130px' }}>
              <label style={fieldLabelStyle} htmlFor="deal-amount">Value ({money.currency})</label>
              <input id="deal-amount" style={fieldInputStyle} type="number" min="0" value={money.amount} onChange={(e) => onMoney({ ...money, amount: e.target.value })} placeholder="0" />
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <label style={fieldLabelStyle} htmlFor="deal-rate">1 {money.currency} in {own}</label>
              <input id="deal-rate" style={fieldInputStyle} type="number" min="0" step="any" value={money.rate} onChange={(e) => onMoney({ ...money, rate: e.target.value })} />
            </div>
          </>
        )}
      </div>
      {money.currency && (
        <div style={{ fontSize: '0.6rem', color: 'var(--dim)', margin: '-0.5rem 0 0.9rem' }}>
          {result === null ? 'Totals and reports use the value in your own currency: type the amount and the rate.' : `Counts as ${formatCurrency(result)} in totals and reports.`}
        </div>
      )}
    </div>
  );
}
