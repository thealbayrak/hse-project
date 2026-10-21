import { AppShell } from "@/components/layout/app-shell";
import { StartRedirect } from "@/components/auth/start-redirect";

export default function StartPage() {
  return (
    <AppShell>
      <StartRedirect />
    </AppShell>
  );
}
