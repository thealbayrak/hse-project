import { GeminiReportAnalyzer } from "@/lib/ai/gemini";
import type { ReportAnalyzer } from "@/lib/ai/provider";

/** Server-only: true when a provider key is configured. */
export function isReportAnalysisEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Picks the configured provider. Gemini today; swapping the provider means
 * adding another implementation of ReportAnalyzer and choosing it here.
 */
export function getReportAnalyzer(): ReportAnalyzer | null {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) return new GeminiReportAnalyzer(geminiKey);
  return null;
}
