import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { BoardPage } from "@/components/dashboard/board-page";

export default function BoardRoute() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <BoardPage />
      </Suspense>
    </AppShell>
  );
}
