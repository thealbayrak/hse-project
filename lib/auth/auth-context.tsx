"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";

interface AuthContextValue {
  /** False in demo (mock) mode: there is nothing to sign in to. */
  enabled: boolean;
  /** Undefined while the first session check is running. */
  session: Session | null | undefined;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const enabled = isSupabaseConfigured();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState<SupabaseClient<Database> | null>(() =>
    enabled ? createBrowserSupabaseClient() : null
  );
  const [session, setSession] = useState<Session | null | undefined>(enabled ? undefined : null);

  useEffect(() => {
    if (!client) return;

    // onAuthStateChange fires INITIAL_SESSION right away, then every change.
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled,
      session,
      email: session?.user.email ?? null,
      signOut: async () => {
        await client?.auth.signOut();
      },
    }),
    [client, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
