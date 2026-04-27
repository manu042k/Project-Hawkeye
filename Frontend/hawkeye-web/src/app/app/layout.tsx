/** Global `/app` shell: routes outside `(workspace)` (e.g. project selector) have no sidebar. */
export default function AppSegmentLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-background text-foreground">{children}</div>;
}
