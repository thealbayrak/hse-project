/** Names a company may not take as its address: they belong to the app itself. */
const RESERVED = new Set(["www", "app", "api", "admin", "mail", "login", "staging", "dev", "test"]);

/** A company name turned into a sub-domain label: "Volvo Personvagnar AB" becomes "volvo-personvagnar-ab". */
export function slugify(name: string) {
  const base = name
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 38)
    .replaceAll(/-+$/g, "");
  return base || "company";
}

/** True for a label that is valid and not reserved. */
export function isValidSlug(slug: string) {
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && !RESERVED.has(slug);
}

/** The root domain the company sub-domains hang under (for example "example.com"); empty when not set up. */
export function rootDomain() {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
}

/** The company's own address when a root domain is configured, otherwise the address this page runs on. */
export function companyBaseUrl(slug: string | null | undefined, origin: string, root = rootDomain()) {
  return slug && root ? `https://${slug}.${root}` : origin;
}

/** The link a QR code carries: the report form with the key that stands for a company or one place. */
export function reportUrl(key: string, base: string) {
  return `${base}/report?k=${encodeURIComponent(key)}`;
}

/** The company slug from a request host such as "volvo.example.com"; null for the root domain or another host. */
export function slugFromHost(host: string, root = rootDomain()) {
  const clean = host.split(":")[0].toLowerCase();
  if (!root || !clean.endsWith(`.${root}`)) return null;
  const label = clean.slice(0, -(root.length + 1));
  return label && !label.includes(".") && isValidSlug(label) ? label : null;
}
