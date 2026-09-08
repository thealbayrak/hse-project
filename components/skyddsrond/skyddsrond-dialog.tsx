"use client";

import { SkyddsrondWizard } from "@/components/skyddsrond/SkyddsrondWizard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function SkyddsrondDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{t("walk.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("walk.dialogBody")}</DialogDescription>
        </DialogHeader>
        <SkyddsrondWizard onCompleted={onClose} onCancel={onClose} showFullPageLink />
      </DialogContent>
    </Dialog>
  );
}
