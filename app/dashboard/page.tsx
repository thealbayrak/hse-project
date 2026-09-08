import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <DashboardView />
      </Suspense>
    </AppShell>
  );
}
