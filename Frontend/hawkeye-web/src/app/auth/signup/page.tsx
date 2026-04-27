"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useMemo, useState } from "react";
import { Loader2, Mail, ShieldCheck, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/brand/brand-logo";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.72 1.22 9.23 3.61l6.9-6.9C36.01 2.45 30.37 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.04 6.24C12.5 13.01 17.78 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.14 24.55c0-1.7-.15-3.34-.43-4.95H24v9.38h12.43c-.54 2.9-2.2 5.36-4.69 7.02l7.19 5.57c4.2-3.88 6.61-9.59 6.61-17.02Z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.46A14.4 14.4 0 0 1 9.85 24c0-1.56.27-3.07.75-4.46l-8.04-6.24A23.96 23.96 0 0 0 0 24c0 3.89.93 7.57 2.56 10.78l8.04-6.32Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.37 0 11.72-2.1 15.63-5.7l-7.19-5.57c-2 1.35-4.57 2.15-8.44 2.15-6.22 0-11.5-3.51-13.4-8.96l-8.04 6.32C6.51 42.62 14.62 48 24 48Z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 0C5.37 0 0 5.48 0 12.24c0 5.41 3.44 9.99 8.21 11.61.6.12.82-.27.82-.6 0-.3-.01-1.1-.02-2.16-3.34.75-4.04-1.65-4.04-1.65-.55-1.41-1.34-1.78-1.34-1.78-1.09-.77.08-.75.08-.75 1.2.09 1.83 1.26 1.83 1.26 1.07 1.87 2.8 1.33 3.49 1.02.11-.8.42-1.33.76-1.64-2.66-.31-5.47-1.36-5.47-6.06 0-1.34.46-2.43 1.23-3.29-.12-.31-.54-1.57.12-3.27 0 0 1.01-.33 3.3 1.26.96-.27 1.98-.4 3-.41 1.02 0 2.04.14 3 .41 2.29-1.59 3.3-1.26 3.3-1.26.66 1.7.24 2.96.12 3.27.77.86 1.23 1.95 1.23 3.29 0 4.71-2.81 5.75-5.49 6.06.43.38.81 1.12.81 2.26 0 1.63-.02 2.95-.02 3.35 0 .33.22.73.83.6C20.56 22.23 24 17.65 24 12.24 24 5.48 18.63 0 12 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nameError = useMemo(() => {
    if (!name) return null;
    return name.trim().length >= 2 ? null : "Enter your full name.";
  }, [name]);

  const emailError = useMemo(() => {
    if (!email) return null;
    return isValidEmail(email) ? null : "Enter a valid email address.";
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    return password.length >= 8 ? null : "Password must be at least 8 characters.";
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirm) return null;
    return confirm === password ? null : "Passwords do not match.";
  }, [confirm, password]);

  const canSubmit =
    !nameError &&
    !emailError &&
    !passwordError &&
    !confirmError &&
    name.length > 0 &&
    email.length > 0 &&
    password.length > 0 &&
    confirm.length > 0 &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    window.location.href = "/app";
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
              <h1 className="mt-10 text-3xl font-semibold tracking-tight">Create your account and explore the demo.</h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Use email + password, or continue with Google/GitHub. This is a static UI—sign up takes you to the dashboard.
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Why teams use Hawkeye</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-primary/80" />
                  One place for runs, suites, and baselines
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-primary/80" />
                  Fast triage with clear status and logs
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-primary/80" />
                  Vault UX designed for safe secret handling
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[440px]">
            <Card className="w-full border-border/60 bg-card/60 shadow-[0_0_20px_rgba(0,0,0,0.15)]">
              <CardHeader className="items-center text-center">
                <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg border border-border/60 bg-card text-primary">
                  <BrandLogo className="w-8" alt="Hawkeye" />
                </div>
                <CardTitle className="text-2xl tracking-tight">Create your account</CardTitle>
                <CardDescription>Start with email, or continue with a provider</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-center gap-2"
                    onClick={() => signIn("github", { callbackUrl: "/app" })}
                  >
                    <GitHubIcon className="size-4 text-foreground" />
                    Continue with GitHub
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-center gap-2"
                    onClick={() => signIn("google", { callbackUrl: "/app" })}
                  >
                    <GoogleIcon className="size-4" />
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
                    <Label htmlFor="name">Full name</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="name"
                        autoComplete="name"
                        placeholder="Jane Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 pl-9"
                        aria-invalid={!!nameError}
                      />
                    </div>
                    {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
                  </div>

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
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 pl-9"
                        aria-invalid={!!passwordError}
                      />
                    </div>
                    {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <div className="relative">
                      <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="h-11 pl-9"
                        aria-invalid={!!confirmError}
                      />
                    </div>
                    {confirmError ? <p className="text-xs text-destructive">{confirmError}</p> : null}
                  </div>

                  <Button className="h-11 w-full" disabled={!canSubmit}>
                    {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    Create account
                  </Button>
                </form>

                <p className="pt-2 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link className="font-semibold text-primary hover:underline" href="/auth/login">
                    Sign in
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

