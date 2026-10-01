import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { countryByCode, setGlobalCurrency, DEFAULT_COUNTRY_CODE } from '../lib/currency';

interface CurrencyContextValue {
  countryCode: string;
  setCountryCode: (code: string) => Promise<void>;
  saving: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);
const STORAGE_KEY = 'raptor_country';

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [countryCode, setCountryCodeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_COUNTRY_CODE
  );
  const [saving, setSaving] = useState(false);

  // Applies immediately on every change, including the very first render -
  // formatCurrency() is correct from the start using whatever was cached
  // locally, rather than defaulting to USD until Supabase responds.
  useEffect(() => {
    const country = countryByCode(countryCode);
    setGlobalCurrency(country.currency, country.locale);
  }, [countryCode]);

  // Pulls the real saved preference once signed in - overrides the local
  // cache if it disagrees (e.g. a different device set it last).
  useEffect(() => {
    if (!user) return;
    supabase
      .from('raptor_users')
      .select('country')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.country) {
          setCountryCodeState(data.country);
          localStorage.setItem(STORAGE_KEY, data.country);
        }
      });
  }, [user]);

  const setCountryCode = useCallback(
    async (code: string) => {
      setCountryCodeState(code);
      localStorage.setItem(STORAGE_KEY, code);
      if (!user) return;
      setSaving(true);
      try {
        await supabase.from('raptor_users').update({ country: code }).eq('user_id', user.id);
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  return (
    <CurrencyContext.Provider value={{ countryCode, setCountryCode, saving }}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
