"use client";

import { createContext, useContext } from "react";

/** The company whose address (sub-domain) the visitor came in on; null on the main address. */
export interface Brand {
  slug: string;
  name: string;
}

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand: Brand | null; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}
