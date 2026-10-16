"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyholeIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function LoginForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "magic" | null>(null);

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy("password");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error(t("auth.failed"));
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) return;
    setBusy("magic");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${next}`, shouldCreateUser: false },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth.magicSent"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={(event) => void signInWithPassword(event)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">{t("auth.email")}</Label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 pl-10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">{t("auth.password")}</Label>
        <div className="relative">
          <LockKeyholeIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 pl-10"
          />
        </div>
      </div>
      <Button type="submit" className="h-12 w-full" disabled={busy !== null}>
        {busy === "password" ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full"
        disabled={busy !== null || !email.trim()}
        onClick={() => void sendMagicLink()}
      >
        {t("auth.magicLink")}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("auth.noAccount")}</p>
    </form>
  );
}
