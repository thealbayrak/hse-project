import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoginView } from "@/components/auth/login-view";

export default function LoginPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </AppShell>
  );
}
