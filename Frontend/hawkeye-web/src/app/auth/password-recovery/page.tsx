"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/brand/brand-logo";
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
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent"
      />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-6xl grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden border-r border-border/60 lg:block">
          <div className="relative flex h-full flex-col justify-between p-10">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                  <BrandLogo className="w-6" alt="Hawkeye" priority />
                </span>
                Hawkeye
              </Link>
              <h1 className="mt-10 text-3xl font-semibold tracking-tight">Reset your password.</h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                We’ll send a reset link to the email you used to create your account.
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Tips</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-primary/80" />
                  Check your spam folder if you don’t see the email
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-primary/80" />
                  Make sure you entered the same address you signed up with
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[440px]">
            <Card className="w-full border-border/60 bg-card/60 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
              <CardHeader className="items-center text-center">
                <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg border border-border/60 bg-card text-foreground">
                  <Lock className="size-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-2xl tracking-tight">Reset your password</CardTitle>
                <CardDescription>Enter your email address and we&apos;ll send you a reset link.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
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
                    Send reset link
                  </Button>
                </form>

                <Separator className="bg-border/60" />

                <div className="flex items-center justify-center">
                  <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/auth/login">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back to sign in
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

