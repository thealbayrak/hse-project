"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { IncidentProvider } from "@/lib/store/incident-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <LanguageProvider>
        <IncidentProvider>
          {children}
          <Toaster position="top-center" richColors />
        </IncidentProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
