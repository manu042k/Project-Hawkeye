"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bold, Italic, List, Code, Eye, Edit3, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  compact?: boolean;
  className?: string;
}

type ToolbarAction = {
  icon: React.ReactNode;
  title: string;
  action: (val: string, selStart: number, selEnd: number) => { value: string; cursorStart: number; cursorEnd: number };
};

function wrap(prefix: string, suffix: string, selected: string, full: string, start: number, end: number) {
  const hasSelection = start !== end;
  const inner = hasSelection ? full.slice(start, end) : "text";
  const replaced = `${prefix}${inner}${suffix}`;
  return {
    value: full.slice(0, start) + replaced + full.slice(end),
    cursorStart: start + prefix.length,
    cursorEnd: start + prefix.length + inner.length,
  };
}

function insertLine(prefix: string, full: string, pos: number) {
  const before = full.slice(0, pos);
  const after = full.slice(pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineContent = before.slice(lineStart);
  const insertion = lineContent.length === 0 ? `${prefix} ` : `\n${prefix} `;
  return {
    value: full.slice(0, pos) + insertion + after,
    cursorStart: pos + insertion.length,
    cursorEnd: pos + insertion.length,
  };
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    icon: <Bold className="size-3.5" />,
    title: "Bold",
    action: (val, s, e) => wrap("**", "**", val.slice(s, e), val, s, e),
  },
  {
    icon: <Italic className="size-3.5" />,
    title: "Italic",
    action: (val, s, e) => wrap("_", "_", val.slice(s, e), val, s, e),
  },
  {
    icon: <Code className="size-3.5" />,
    title: "Inline code",
    action: (val, s, e) => wrap("`", "`", val.slice(s, e), val, s, e),
  },
  {
    icon: <List className="size-3.5" />,
    title: "Bullet list",
    action: (val, s, e) => insertLine("-", val, s),
  },
  {
    icon: <Minus className="size-3.5" />,
    title: "Numbered item",
    action: (val, s, e) => insertLine("1.", val, s),
  },
];

export function RichTextEditor({ value, onChange, placeholder, rows = 4, compact = false, className }: RichTextEditorProps) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyAction(action: ToolbarAction) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const result = action.action(value, s, e);
    onChange(result.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.cursorStart, result.cursorEnd);
    });
  }

  const baseTextarea = cn(
    "w-full rounded-b-md border-x border-b border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-mono",
    className,
  );

  const basePreview = cn(
    "w-full rounded-b-md border-x border-b border-input bg-background/60 px-3 py-2 text-sm min-h-[80px]",
    "prose prose-sm dark:prose-invert max-w-none",
    "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
    "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono",
    "[&_strong]:font-semibold [&_em]:italic",
    "[&_p]:mb-2 last:[&_p]:mb-0",
  );

  return (
    <div className="rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-input bg-muted/30 px-2 py-1">
        <div className="flex items-center gap-0.5">
          {!preview && TOOLBAR_ACTIONS.map((a) => (
            <button
              key={a.title}
              type="button"
              title={a.title}
              onMouseDown={(e) => { e.preventDefault(); applyAction(a); }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {a.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
            preview
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {preview ? <><Edit3 className="size-3" /> Edit</> : <><Eye className="size-3" /> Preview</>}
        </button>
      </div>

      {preview ? (
        <div
          className={basePreview}
          style={{ minHeight: `${rows * 1.6}rem` }}
        >
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <span className="text-muted-foreground italic">{placeholder ?? "Nothing to preview"}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={baseTextarea}
          style={{ borderRadius: 0 }}
        />
      )}
    </div>
  );
}
