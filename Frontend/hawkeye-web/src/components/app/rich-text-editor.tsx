"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Undo, Redo, Heading2, Heading3, SquareCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  showWordCount?: boolean;
  viewMode?: boolean;
  onEdit?: () => void;
  compact?: boolean;
}

export function wordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}

type ToolbarBtn = { type: "btn"; icon: React.ReactNode; title: string; action: () => void; active: boolean };
type ToolbarDiv = { type: "div" };
type ToolbarItem = ToolbarBtn | ToolbarDiv;

export function RichTextEditor({ value, onChange, placeholder, rows = 4, className, showWordCount = false, viewMode = false, onEdit, compact = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure(),
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: [
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "px-3 py-2",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono",
          "[&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-3 [&_pre]:text-xs [&_pre]:font-mono",
          "[&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
          "[&_.is-editor-empty_p]:text-muted-foreground/60 [&_.is-editor-empty_p::before]:content-[attr(data-placeholder)]",
        ].join(" "),
      },
      handleDrop: () => true,
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        if (items.some((i) => i.type.startsWith("image/"))) return true;
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.getHTML();
    if (current !== value) editor.commands.setContent(value || "");
  }, [value]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!viewMode);
  }, [viewMode, editor]);

  if (!editor) return null;

  const toolbar: ToolbarItem[] = [
    { type: "btn", icon: <Bold className="size-3.5" />, title: "Bold", action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { type: "btn", icon: <Italic className="size-3.5" />, title: "Italic", action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { type: "btn", icon: <Strikethrough className="size-3.5" />, title: "Strike", action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
    { type: "div" },
    { type: "btn", icon: <Heading2 className="size-3.5" />, title: "Heading 2", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
    { type: "btn", icon: <Heading3 className="size-3.5" />, title: "Heading 3", action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive("heading", { level: 3 }) },
    { type: "div" },
    { type: "btn", icon: <List className="size-3.5" />, title: "Bullet list", action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { type: "btn", icon: <ListOrdered className="size-3.5" />, title: "Ordered list", action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { type: "div" },
    { type: "btn", icon: <Code className="size-3.5" />, title: "Inline code", action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
    { type: "btn", icon: <SquareCode className="size-3.5" />, title: "Code block", action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive("codeBlock") },
    { type: "btn", icon: <Quote className="size-3.5" />, title: "Blockquote", action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
    { type: "div" },
    { type: "btn", icon: <Undo className="size-3.5" />, title: "Undo", action: () => editor.chain().focus().undo().run(), active: false },
    { type: "btn", icon: <Redo className="size-3.5" />, title: "Redo", action: () => editor.chain().focus().redo().run(), active: false },
  ];

  const wc = showWordCount ? wordCount(value) : 0;

  if (viewMode) {
    return (
      <div className={cn("relative group rounded-md border border-input bg-background/60", className)}>
        <div
          className={[
            "prose prose-sm dark:prose-invert max-w-none px-3 py-2",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
            "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_code]:font-mono",
            "[&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-3 [&_pre]:text-xs",
          ].join(" ")}
          style={{ minHeight: `${rows * 1.7}rem` }}
          dangerouslySetInnerHTML={{ __html: value || `<p class="text-muted-foreground italic">${placeholder ?? ""}</p>` }}
        />
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/60"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring", className)}>
      <div className="flex items-center flex-wrap gap-0.5 border-b border-input bg-muted/30 px-2 py-1">
        {toolbar.map((item, i) => {
          if (item.type === "div") return <span key={i} className="h-4 w-px bg-border/60 mx-0.5" />;
          return (
            <button
              key={item.title}
              type="button"
              title={item.title}
              onMouseDown={(e) => { e.preventDefault(); item.action(); }}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition-colors",
                item.active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      <EditorContent editor={editor} style={{ minHeight: `${rows * 1.7}rem` }} />

      {showWordCount && (
        <div className="flex justify-end border-t border-input bg-muted/20 px-3 py-1">
          <span className={cn("text-xs", wc >= 50 ? "text-emerald-500" : "text-muted-foreground")}>
            {wc} / 50 words
          </span>
        </div>
      )}
    </div>
  );
}
