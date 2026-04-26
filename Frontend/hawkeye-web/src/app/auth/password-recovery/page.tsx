"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function PasswordRecoveryPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailError = useMemo(() => {
    if (!email) return null;
    return isValidEmail(email) ? null : "Enter a valid email address.";
  }, [email]);

  const canSubmit = !emailError && email.length > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    setSubmitting(false);
    toast.success("Reset link sent", { description: "If this were a real app, you’d receive an email shortly." });
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-[400px] flex-col items-center justify-center">
        <Card className="w-full border-border/60 bg-card/60 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
          <CardHeader className="items-center text-center">
            <div className="mb-3 inline-flex size-12 items-center justify-center rounded-full border border-border/60 bg-card text-foreground">
              <Lock className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl tracking-tight">Reset your password</CardTitle>
            <CardDescription>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  aria-invalid={!!emailError}
                />
                {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
              </div>

              <Button className="h-11 w-full" disabled={!canSubmit}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Send Reset Link
              </Button>
            </form>

            <Separator className="bg-border/60" />

            <div className="text-center">
              <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/auth/login">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to log in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

