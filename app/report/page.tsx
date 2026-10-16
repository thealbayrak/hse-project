import { AppShell } from "@/components/layout/app-shell";
import { ReportWizard } from "@/components/report/report-wizard";
import { isReportAnalysisEnabled } from "@/lib/ai";

export default function ReportPage() {
  return (
    <AppShell>
      <ReportWizard aiEnabled={isReportAnalysisEnabled()} />
    </AppShell>
  );
}
