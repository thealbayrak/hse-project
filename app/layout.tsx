import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { BrandProvider, type Brand } from "@/components/brand-context";
import { IosStartupImages } from "@/components/ios-startup-images";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { Providers } from "@/components/providers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonServerClient } from "@/lib/supabase/server";
import { STORAGE_KEY, isLocale, localeFromBrowser } from "@/lib/i18n/translations";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SiteSafety Nordic",
  description:
    "Report hazards, accidents and near-misses (tillbud) for Swedish construction sites and plants. SAM / Arbetsmiljöverket aligned.",
  applicationName: "SiteSafety Nordic",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "SiteSafety",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled (WCAG 1.4.4); the layout is built for large touch targets anyway.
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light dark",
};

/** The language chosen in the app (cookie), else the browser's Accept-Language. */
async function resolveInitialLocale() {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(STORAGE_KEY)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerList = await headers();
  return localeFromBrowser(headerList.get("accept-language") ?? "");
}

/** The company behind the sub-domain the proxy saw (x-company-slug), if any and if it exists. */
async function resolveBrand(): Promise<Brand | null> {
  const slug = (await headers()).get("x-company-slug");
  if (!slug || !isSupabaseConfigured()) return null;
  try {
    const { data } = await createAnonServerClient().from("organizations").select("name, slug").eq("slug", slug).eq("active", true).maybeSingle();
    return data?.slug ? { slug: data.slug, name: data.name } : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialLocale = await resolveInitialLocale();
  const brand = await resolveBrand();

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <IosStartupImages />
      </head>
      <body className="flex min-h-full min-h-dvh flex-col font-sans">
        <BrandProvider brand={brand}>
          <Providers initialLocale={initialLocale}>
            {children}
            <PWAInstallBanner />
          </Providers>
        </BrandProvider>
      </body>
    </html>
  );
}
