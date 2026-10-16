import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// Rendered dynamically (the root layout reads cookies), so useSearchParams needs
// no Suspense boundary. Avoiding the boundary also keeps hydration in one pass:
// a lazily hydrated boundary would compare the server HTML against client state
// that may already have moved on (session resolved, data loaded).
export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
