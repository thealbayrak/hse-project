import * as XLSX from "xlsx";
import { mapRole } from "@/lib/supabase/mappers";
import type { ProfileImportRow } from "@/lib/types";

/**
 * Reads an Excel (.xlsx/.xls) or CSV file of people. Column headers are matched
 * loosely in Swedish, English and Turkish, so an HR export usually works as-is.
 */
const HEADER_ALIASES: Record<keyof ProfileImportRow, string[]> = {
  fullName: ["name", "full name", "fullname", "namn", "ad soyad", "adsoyad", "isim", "ad", "employee", "person"],
  email: ["email", "e-mail", "e-post", "epost", "mail", "e-posta", "eposta"],
  phone: ["phone", "telefon", "tel", "mobile", "mobil", "gsm"],
  role: ["role", "roll", "rol", "title", "titel", "unvan", "ünvan", "position", "befattning", "pozisyon"],
  siteName: ["site", "arbetsställe", "arbetsstalle", "şantiye", "santiye", "plats", "workplace", "location"],
  employeeNo: ["employee no", "employee number", "employeeno", "anställningsnummer", "anstnr", "sicil", "sicil no", "personalnummer", "id", "nr"],
  reportsToEmail: ["manager email", "reports to email", "chef e-post", "şef e-posta", "sef eposta", "supervisor email", "foreman email"],
  reportsToName: ["manager", "reports to", "chef", "şef", "sef", "supervisor", "foreman", "arbetsledare", "amir"],
  language: ["language", "språk", "sprak", "dil", "lang"],
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[_\-.]+/g, " ")
    .replaceAll(/\s+/g, " ");
}

const NORMALIZED_ALIASES = (Object.entries(HEADER_ALIASES) as [keyof ProfileImportRow, string[]][]).map(
  ([field, aliases]) => [field, aliases.map(normalizeHeader)] as const
);

export function matchHeader(header: string): keyof ProfileImportRow | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const [field, aliases] of NORMALIZED_ALIASES) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

export function rowsFromSheet(rows: Record<string, unknown>[]): ProfileImportRow[] {
  return rows
    .map((raw) => {
      const row: ProfileImportRow = { fullName: "" };
      for (const [header, value] of Object.entries(raw)) {
        const field = matchHeader(header);
        if (!field) continue;
        const text = String(value ?? "").trim();
        if (!text) continue;
        if (field === "role") row.role = mapRole(text);
        else row[field] = text;
      }
      return row;
    })
    .filter((row) => row.fullName);
}

export async function parsePeopleFile(file: File): Promise<ProfileImportRow[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(data, { type: "array" });
  const first = workbook.Sheets[workbook.SheetNames[0]];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: "" });
  return rowsFromSheet(rows);
}

/** A ready-to-fill template the admin can download. */
export function buildTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Email", "Phone", "Role", "Site", "Employee no", "Manager email", "Language"],
    ["Anna Bergström", "anna@example.se", "+46701234567", "hse_manager", "", "1001", "", "sv"],
    ["Erik Lindqvist", "erik@example.se", "", "safety_officer", "Kvillebäcken Construction Site", "1002", "anna@example.se", "sv"],
    ["Johan Ek", "johan@example.se", "", "foreman", "Kvillebäcken Construction Site", "2001", "erik@example.se", "sv"],
    ["Ali Yılmaz", "", "+46701234568", "worker", "Kvillebäcken Construction Site", "3001", "johan@example.se", "tr"],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "People");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
