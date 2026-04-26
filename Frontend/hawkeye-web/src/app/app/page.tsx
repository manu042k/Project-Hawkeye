import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function AppIndex() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-xl">
          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="size-5 text-primary" aria-hidden="true" />
                App shell ready
              </CardTitle>
              <CardDescription>
                This is a static UI build. Use the navigation to explore pages, or jump straight to the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Link href="/app/dashboard" className={cn(buttonVariants({ variant: "default" }))}>
                Open dashboard <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/app/settings/integrations" className={cn(buttonVariants({ variant: "outline" }))}>
                Settings
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

