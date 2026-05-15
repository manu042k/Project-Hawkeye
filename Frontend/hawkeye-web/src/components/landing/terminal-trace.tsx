"use client";

import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

const LINES = [
  { prefix: "[Observe]", color: "text-blue-400",     text: "Navigated to /checkout. Screenshot captured." },
  { prefix: "[Reason]",  color: "text-violet-400",   text: "Checkout form visible. Filling shipping details." },
  { prefix: "[Act]",     color: "text-amber-400",    text: 'browser_type("#shipping-name", "Jane Doe")' },
  { prefix: "[Observe]", color: "text-blue-400",     text: "Field filled. Place Order button found." },
  { prefix: "[Act]",     color: "text-amber-400",    text: "browser_click(\"button[data-test='place-order']\")" },
  { prefix: "[Observe]", color: "text-blue-400",     text: "Order confirmation page rendered." },
  { prefix: "[Assert]",  color: "text-emerald-400",  text: "Order total matches expected. ✓ Test passed." },
];

const LINE_DELAY_MS = 800;
const LOOP_PAUSE_MS = 2800;

export function TerminalTrace() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [looping, setLooping] = useState(false);

  useEffect(() => {
    if (looping) {
      const t = setTimeout(() => {
        setVisibleCount(0);
        setLooping(false);
      }, LOOP_PAUSE_MS);
      return () => clearTimeout(t);
    }

    if (visibleCount < LINES.length) {
      const t = setTimeout(() => setVisibleCount((c) => c + 1), LINE_DELAY_MS);
      return () => clearTimeout(t);
    }

    setLooping(true);
  }, [visibleCount, looping]);

  const done = visibleCount === LINES.length && !looping;

  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-sm text-muted-foreground select-none">
      <div className="flex items-center gap-2 text-xs">
        <span className="size-2.5 rounded-full bg-rose-500/80" />
        <span className="size-2.5 rounded-full bg-amber-500/80" />
        <span className="size-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 text-muted-foreground/70">agent trace</span>
      </div>
      <Separator className="my-3 bg-border/60" />

      {/* Fixed height prevents layout shift when lines reset */}
      <div className="h-[172px] overflow-hidden space-y-2">
        {LINES.slice(0, visibleCount).map((line, i) => (
          <div
            key={`${i}-${looping}`}
            style={{ animationDelay: `${i * 30}ms` }}
            className="flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
          >
            <span className={`shrink-0 ${line.color}`}>{line.prefix}</span>
            <span>{line.text}</span>
          </div>
        ))}

        {/* Blinking cursor shown while typing or waiting to loop */}
        {(!done || looping) && (
          <div className="flex items-center gap-1 pt-0.5">
            <span
              className={`inline-block h-[15px] w-[7px] rounded-sm ${
                done ? "bg-emerald-400/80" : "bg-primary/70"
              } animate-pulse`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
