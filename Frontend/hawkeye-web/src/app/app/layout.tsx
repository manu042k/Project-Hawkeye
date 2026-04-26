import { AppSidebar } from "@/components/app/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-[1600px]">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

