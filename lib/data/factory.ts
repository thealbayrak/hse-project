import { createMockRepository } from "@/lib/data/mock-repository";
import type { IncidentRepository } from "@/lib/data/repository";
import { createSupabaseRepository } from "@/lib/data/supabase-repository";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function createIncidentRepository(): IncidentRepository {
  if (isSupabaseConfigured()) {
    return createSupabaseRepository();
  }
  return createMockRepository();
}
