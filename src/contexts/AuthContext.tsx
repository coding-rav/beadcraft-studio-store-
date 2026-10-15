import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';

const NOT_CONNECTED = 'Accounts are not connected yet. The store owner needs to add the Supabase settings.';

type Ctx = {
  user: User | null; loading: boolean;
  signUp(v: { name: string; email: string; phone: string; password: string; next?: string }): Promise<{ needsEmailConfirm: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Listener first, then read the stored session (avoids missing an event).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false); });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: Ctx = {
    user: session?.user ?? null, loading,
    async signUp({ name, email, phone, password, next }) {
      if (!supabaseConfigured) throw new Error(NOT_CONNECTED);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim(), phone }, emailRedirectTo: `${location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}` },
      });
      if (error) throw error;
      return { needsEmailConfirm: !data.session }; // true when email confirmation is on in Supabase
    },
    async signIn(email, password) {
      if (!supabaseConfigured) throw new Error(NOT_CONNECTED);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signOut() { await supabase.auth.signOut(); },
    async sendReset(email) {
      if (!supabaseConfigured) throw new Error(NOT_CONNECTED);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` });
      if (error) throw error;
    },
    async setNewPassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
