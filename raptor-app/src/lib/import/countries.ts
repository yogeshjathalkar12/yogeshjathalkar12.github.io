// Phone numbers that carry no country code ("98765 43210", "020-2567 1234"): the person says which country they are from,
// once per import, and the code is added. Raptor never guesses it. Pure, no network.
//
// The lengths are the national number's digit counts as published in the ITU numbering plans, simplified to a range:
// they are only used to tell "a national number" from "a number that already starts with the country code" and to leave
// alone anything that does not fit, so a wrong guess never creates a wrong number.

export interface Country { code: string; name: string; dial: string; min: number; max: number; trunkZero: boolean }

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', dial: '91', min: 10, max: 10, trunkZero: true },
  { code: 'US', name: 'United States', dial: '1', min: 10, max: 10, trunkZero: false },
  { code: 'CA', name: 'Canada', dial: '1', min: 10, max: 10, trunkZero: false },
  { code: 'GB', name: 'United Kingdom', dial: '44', min: 9, max: 10, trunkZero: true },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', min: 8, max: 9, trunkZero: true },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', min: 8, max: 9, trunkZero: true },
  { code: 'SG', name: 'Singapore', dial: '65', min: 8, max: 8, trunkZero: false },
  { code: 'AU', name: 'Australia', dial: '61', min: 9, max: 9, trunkZero: true },
  { code: 'NZ', name: 'New Zealand', dial: '64', min: 8, max: 10, trunkZero: true },
  { code: 'DE', name: 'Germany', dial: '49', min: 7, max: 11, trunkZero: true },
  { code: 'FR', name: 'France', dial: '33', min: 9, max: 9, trunkZero: true },
  { code: 'NL', name: 'Netherlands', dial: '31', min: 9, max: 9, trunkZero: true },
  { code: 'ES', name: 'Spain', dial: '34', min: 9, max: 9, trunkZero: false },
  { code: 'IT', name: 'Italy', dial: '39', min: 6, max: 11, trunkZero: false },
  { code: 'IE', name: 'Ireland', dial: '353', min: 7, max: 9, trunkZero: true },
  { code: 'SE', name: 'Sweden', dial: '46', min: 7, max: 10, trunkZero: true },
  { code: 'CH', name: 'Switzerland', dial: '41', min: 9, max: 9, trunkZero: true },
  { code: 'BR', name: 'Brazil', dial: '55', min: 10, max: 11, trunkZero: true },
  { code: 'MX', name: 'Mexico', dial: '52', min: 10, max: 10, trunkZero: false },
  { code: 'ZA', name: 'South Africa', dial: '27', min: 9, max: 9, trunkZero: true },
  { code: 'NG', name: 'Nigeria', dial: '234', min: 7, max: 10, trunkZero: true },
  { code: 'KE', name: 'Kenya', dial: '254', min: 9, max: 9, trunkZero: true },
  { code: 'PK', name: 'Pakistan', dial: '92', min: 10, max: 10, trunkZero: true },
  { code: 'BD', name: 'Bangladesh', dial: '880', min: 10, max: 10, trunkZero: true },
  { code: 'LK', name: 'Sri Lanka', dial: '94', min: 9, max: 9, trunkZero: true },
  { code: 'NP', name: 'Nepal', dial: '977', min: 8, max: 10, trunkZero: true },
  { code: 'ID', name: 'Indonesia', dial: '62', min: 8, max: 12, trunkZero: true },
  { code: 'MY', name: 'Malaysia', dial: '60', min: 7, max: 10, trunkZero: true },
  { code: 'PH', name: 'Philippines', dial: '63', min: 10, max: 10, trunkZero: true },
  { code: 'JP', name: 'Japan', dial: '81', min: 9, max: 10, trunkZero: true },
  { code: 'HK', name: 'Hong Kong', dial: '852', min: 8, max: 8, trunkZero: false },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export interface WithCountry { value: string; note?: string }

/** Add the country code to one cleaned phone number that has none. A number that already starts with + is returned as it is. */
export function applyCountry(value: string, country: Country): WithCountry {
  if (/^\s*\+/.test(value)) return { value };
  const digits = value.replace(/\(0\)/g, '').replace(/\D/g, '');
  const fits = (n: number) => n >= country.min && n <= country.max;
  // already carries the country code, only the + is missing ("919876543210")
  if (digits.startsWith(country.dial) && fits(digits.length - country.dial.length)) return { value: `+${country.dial} ${digits.slice(country.dial.length)}` };
  // the national trunk digit ("020-2567 1234", "07911 123456") is not part of the international number
  if (country.trunkZero && digits.startsWith('0') && fits(digits.length - 1)) return { value: `+${country.dial} ${digits.slice(1)}` };
  if (fits(digits.length)) return { value: `+${country.dial} ${digits}` };
  return { value, note: `"${value}" has ${digits.length} digits, which does not fit a ${country.name} number, so no country code was added` };
}
