"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { landingFor } from "@/lib/auth/landing";
import { useIncidentStore } from "@/lib/store/incident-store";

/** Sends a signed-in person to the page that fits their role, once their profile has loaded. */
export function StartRedirect() {
  const router = useRouter();
  const { profile, role } = useIncidentStore();

  useEffect(() => {
    if (profile === undefined) return;
    router.replace(landingFor(role));
  }, [profile, role, router]);

  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" />
    </div>
  );
}
