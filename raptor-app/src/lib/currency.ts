// Country -> currency mapping, plus the module-level "currently active
// currency" formatCurrency() reads from. Kept as plain module state (not
// only React context) specifically so formatCurrency(value) - already
// called from a dozen places across the CRM with the exact same
// zero-argument-besides-value signature - keeps working completely
// unchanged at every existing call site once CurrencyProvider
// (hooks/CurrencyContext.tsx) starts calling setGlobalCurrency().

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
  locale: string;
}

// Not exhaustive (190+ countries) - the markets this product actually
// serves, plus the handful of major global currencies someone outside
// those markets would still expect to find. Add more here as needed;
// nothing else needs to change.
export const COUNTRIES: CountryOption[] = [
  { code: 'IN', name: 'India', currency: 'INR', locale: 'en-IN' },
  { code: 'US', name: 'United States', currency: 'USD', locale: 'en-US' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB' },
  { code: 'CA', name: 'Canada', currency: 'CAD', locale: 'en-CA' },
  { code: 'AU', name: 'Australia', currency: 'AUD', locale: 'en-AU' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', locale: 'en-NZ' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', locale: 'en-SG' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', locale: 'ar-AE' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', locale: 'ar-SA' },
  { code: 'DE', name: 'Germany', currency: 'EUR', locale: 'de-DE' },
  { code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR' },
  { code: 'ES', name: 'Spain', currency: 'EUR', locale: 'es-ES' },
  { code: 'IT', name: 'Italy', currency: 'EUR', locale: 'it-IT' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', locale: 'nl-NL' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', locale: 'en-IE' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', locale: 'de-CH' },
  { code: 'JP', name: 'Japan', currency: 'JPY', locale: 'ja-JP' },
  { code: 'CN', name: 'China', currency: 'CNY', locale: 'zh-CN' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', locale: 'pt-BR' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', locale: 'es-MX' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', locale: 'en-ZA' },
];

export const DEFAULT_COUNTRY_CODE = 'IN';

export function countryByCode(code: string): CountryOption {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY_CODE)!;
}

let _currencyCode = 'INR';
let _locale = 'en-IN';

/** Called by CurrencyProvider whenever the resolved country changes. */
export function setGlobalCurrency(currencyCode: string, locale: string): void {
  _currencyCode = currencyCode;
  _locale = locale;
}

export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(_locale, {
      style: 'currency',
      currency: _currencyCode,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    // Unrecognized currency/locale combination - fall back to the
    // original plain-dollar behavior rather than throwing.
    return '$' + n.toLocaleString();
  }
}
