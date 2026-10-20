"use client";

import { useState } from "react";
import { CopyIcon, DownloadIcon, Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateManagementReport } from "@/lib/ai/client";
import { compactIncidents } from "@/lib/ai/context";
import { downloadAiReportPdf } from "@/lib/export";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { AiReport, Incident } from "@/lib/types";

type State = { status: "idle" } | { status: "working" } | { status: "done"; report: AiReport } | { status: "failed"; error: string };

function reportText(report: AiReport) {
  const block = (title: string, items: string[]) => (items.length ? `\n${title}\n${items.map((item) => `- ${item}`).join("\n")}\n` : "");
  return [
    report.title,
    "",
    report.summary,
    block("Key figures", report.keyFigures.map((item) => `${item.label}: ${item.value}`)),
    block("Trends", report.trends),
    block("Top risks", report.topRisks.map((item) => `${item.risk} (${item.count}) — ${item.comment}`)),
    block("Hotspots", report.hotspots),
    block("Recommendations", report.recommendations),
    block("Positives", report.positives),
  ].join("\n");
}

/** "Create report with AI": a written management report over the reports in view. */
export function AiReportButton({
  incidents,
  scope,
  company,
  className,
}: {
  incidents: Incident[];
  scope: string;
  company?: string | null;
  className?: string;
}) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate() {
    setState({ status: "working" });
    try {
      const report = await generateManagementReport({ incidents: compactIncidents(incidents), language: locale, scope, company });
      setState({ status: "done", report });
    } catch (caught) {
      setState({ status: "failed", error: caught instanceof Error ? caught.message : "failed" });
    }
  }

  function openDialog() {
    setOpen(true);
    if (state.status !== "done" && state.status !== "working") void generate();
  }

  return (
    <>
      <Button type="button" className={cn("h-12 gap-2", className)} onClick={openDialog} disabled={!incidents.length}>
        <SparklesIcon className="size-4" />
        {t("aiReport.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-5 text-amber-600 dark:text-amber-400" />
              {state.status === "done" ? state.report.title : t("aiReport.title")}
            </DialogTitle>
            <DialogDescription>
              {scope} · {t("aiReport.basedOn", { n: Math.min(incidents.length, 300) })}
            </DialogDescription>
          </DialogHeader>

          {state.status === "working" && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("aiReport.working")}
            </p>
          )}
          {state.status === "failed" && <p className={cn("rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>{t("aiReport.failed")}</p>}
          {state.status === "done" && <ReportBody report={state.report} />}

          <DialogFooter className="gap-2">
            {state.status === "done" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(reportText(state.report))
                      .then(() => toast.success(t("projects.copied")))
                      .catch(() => toast.error(t("projects.copyFailed")))
                  }
                >
                  <CopyIcon className="size-4" />
                  {t("projects.copy")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2"
                  onClick={() => void downloadAiReportPdf(state.report, { locale, scope }).catch(() => toast.error(t("toast.exportFailed")))}
                >
                  <DownloadIcon className="size-4" />
                  PDF
                </Button>
              </>
            )}
            <Button type="button" variant="outline" className="h-11 gap-2" disabled={state.status === "working"} onClick={() => void generate()}>
              <RefreshCwIcon className="size-4" />
              {t("aiReport.again")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReportBody({ report }: { report: AiReport }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed">{report.summary}</p>
      {report.keyFigures.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {report.keyFigures.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-lg font-semibold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      )}
      <Section title={t("aiReport.trends")} items={report.trends} />
      {report.topRisks.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">{t("aiReport.topRisks")}</h3>
          <ul className="space-y-1">
            {report.topRisks.map((item) => (
              <li key={item.risk}>
                <span className="font-medium">{item.risk}</span> <span className="text-muted-foreground">({item.count})</span> — {item.comment}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section title={t("aiReport.hotspots")} items={report.hotspots} />
      <Section title={t("aiReport.recommendations")} items={report.recommendations} ordered />
      <Section title={t("aiReport.positives")} items={report.positives} />
      <p className="text-xs text-muted-foreground">{t("aiReport.disclaimer")}</p>
    </div>
  );
}

function Section({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  if (!items.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">{title}</h3>
      <List className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </div>
  );
}
