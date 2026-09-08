import { SKYDDSROND_ITEMS } from "@/lib/skyddsrond/checklist";
import type { SafetyWalk } from "@/lib/types";

export const SEED_SAFETY_WALKS: SafetyWalk[] = [
  {
    id: "walk-2026-09-01",
    title: "Skyddsrond · Kvillebäcken Construction Site · 2026-09-01",
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    skyddsombudName: "Maria Holm",
    skyddsombudRole: "Skyddsombud",
    completedAt: "2026-09-01T13:20:00.000Z",
    items: SKYDDSROND_ITEMS.map((item, index) => {
      const isScaffold = item.key === "scaffold-tagged";
      const isWalkway = item.key === "order-walkways";
      return {
        id: `walk-item-${item.key}`,
        walkId: "walk-2026-09-01",
        itemKey: item.key,
        domain: item.domain,
        title: item.title,
        status: isScaffold || isWalkway ? "deviation" : "ok",
        notes: isScaffold
          ? "Scaffold on Zone 3 is missing a current inspection tag."
          : isWalkway
            ? "Pallet stack blocking the east pedestrian lane."
            : "",
        photoUrl: null,
        sortOrder: index,
        actionStatus: isScaffold ? "resolved" : isWalkway ? "pending" : null,
      };
    }),
  },
];
