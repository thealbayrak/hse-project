import { AppShell } from "@/components/layout/app-shell";
import { SuperAdminView } from "@/components/roles/super-admin-view";

export default function Page() {
  return (
    <AppShell>
      <SuperAdminView />
    </AppShell>
  );
}
