import { AppShell } from "@/components/layout/app-shell";
import { AdminOverview } from "@/components/roles/admin-overview";
import { DashboardView } from "@/components/dashboard/dashboard-view";

/** The HSE manager's / site director's page: everything across all areas, plus what is stuck in the workflow. */
export default function AdminDashboardPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <AdminOverview />
        <DashboardView />
      </div>
    </AppShell>
  );
}
