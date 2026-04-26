"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, Loader2, Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailError = useMemo(() => {
    if (!email) return null;
    return isValidEmail(email) ? null : "Enter a valid email address.";
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    return password.length >= 6 ? null : "Password must be at least 6 characters.";
  }, [password]);

  const canSubmit = !emailError && !passwordError && email.length > 0 && password.length > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    // Static build: route to app dashboard
    window.location.href = "/app/dashboard";
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-center justify-center">
        <Card className="w-full border-border/60 bg-card/60 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
          <CardHeader className="items-center text-center">
            <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg border border-border/60 bg-card text-primary">
              <Eye className="size-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in to your Hawkeye account</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="h-11 justify-center gap-2">
                <span className="inline-flex size-4 items-center justify-center rounded-sm bg-foreground text-background text-[9px] font-bold">
                  GH
                </span>
                Continue with GitHub
              </Button>
              <Button type="button" variant="outline" className="h-11 justify-center gap-2">
                <span className="inline-flex size-4 items-center justify-center rounded-sm bg-foreground text-background text-[10px] font-bold">
                  G
                </span>
                Continue with Google
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1 bg-border/60" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">or</span>
              <Separator className="flex-1 bg-border/60" />
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-9"
                    aria-invalid={!!emailError}
                  />
                </div>
                {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link className="text-sm text-primary hover:underline" href="/auth/password-recovery">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-9"
                    aria-invalid={!!passwordError}
                  />
                </div>
                {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
              </div>

              <Button className="h-11 w-full" disabled={!canSubmit}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Sign In
              </Button>
            </form>

            <p className="pt-2 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link className="font-semibold text-primary hover:underline" href="/auth/login">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

