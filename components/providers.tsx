"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useIosViewport } from "@/hooks/use-ios-viewport";
import { AuthProvider } from "@/lib/auth/auth-context";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { IncidentProvider } from "@/lib/store/incident-store";

function IosViewportSync() {
  useIosViewport();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <LanguageProvider>
        <AuthProvider>
          <IncidentProvider>
            <IosViewportSync />
            {children}
            <Toaster
              position="top-center"
              richColors
              offset="calc(env(safe-area-inset-top) + 12px)"
            />
          </IncidentProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
