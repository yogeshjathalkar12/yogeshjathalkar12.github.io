import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';
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
  const { loading: orgLoading, status, isOwner } = useOrg();
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
    if (!user || orgLoading || status !== 'active') return;
    const apply = (country: string | null | undefined) => {
      if (country) {
        setCountryCodeState(country);
        localStorage.setItem(STORAGE_KEY, country);
      }
    };
    if (!isOwner) {
      // Members use the organization's region (the owner's saved setting).
      supabase.rpc('org_plan').then(({ data }) => apply(data?.country));
      return;
    }
    supabase
      .from('raptor_users')
      .select('country')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => apply(data?.country));
  }, [user, orgLoading, status, isOwner]);

  const setCountryCode = useCallback(
    async (code: string) => {
      setCountryCodeState(code);
      localStorage.setItem(STORAGE_KEY, code);
      if (!user || !isOwner) return; // only the owner changes the organization's region
      setSaving(true);
      try {
        // Users can't UPDATE raptor_users directly (that would let them edit
        // their own plan/credits); the owner-only set_org_country() saves just
        // this column. Falls back to the direct update until that function exists.
        const { error } = await supabase.rpc('set_org_country', { p_country: code });
        if (error) await supabase.from('raptor_users').update({ country: code }).eq('user_id', user.id);
      } finally {
        setSaving(false);
      }
    },
    [user, isOwner]
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
