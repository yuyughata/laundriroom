"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A small formatting editor for newsletter text (contentEditable + toolbar).
 * Only formats that email clients show reliably are offered; pasted content
 * is cleaned to the same set as it arrives. The server cleans it again on save.
 */

const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "H2", "H3", "UL", "OL", "LI", "A", "BLOCKQUOTE", "HR"]);
const RENAME: Record<string, string> = { DIV: "P", H1: "H2", H4: "H3", H5: "H3", H6: "H3" };

/** Keep allowed tags (and link targets / text alignment); unwrap everything else. */
function cleanNode(src: Node, doc: Document): Node[] {
  if (src.nodeType === Node.TEXT_NODE) return [doc.createTextNode(src.textContent ?? "")];
  if (src.nodeType !== Node.ELEMENT_NODE) return [];
  const el = src as HTMLElement;
  if (["SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD", "IMG", "SVG", "IFRAME", "OBJECT"].includes(el.tagName)) return [];
  const kids = Array.from(el.childNodes).flatMap((c) => cleanNode(c, doc));
  const tag = RENAME[el.tagName] ?? el.tagName;
  if (!ALLOWED.has(tag)) return kids;
  const out = doc.createElement(tag);
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return kids;
    out.setAttribute("href", href);
  }
  const align = el.style?.textAlign;
  if (align && ["P", "H2", "H3", "LI"].includes(tag) && /^(left|right|center|justify)$/.test(align)) out.style.textAlign = align;
  kids.forEach((k) => out.appendChild(k));
  return [out];
}

export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const box = document.createElement("div");
  Array.from(doc.body.childNodes).flatMap((n) => cleanNode(n, document)).forEach((n) => box.appendChild(n));
  return box.innerHTML;
}

type Cmd = { label: string; title: string; run: () => void; state?: () => boolean };

export function RichTextEditor({ value, onChange, placeholder }: {
  value: string; onChange: (html: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const [block, setBlock] = useState("p");

  // Load the starting value once (and when switching newsletters); typing then owns the DOM.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (ref.current && loaded.current !== value && ref.current.innerHTML !== value) {
      if (loaded.current === null || document.activeElement !== ref.current) ref.current.innerHTML = value || "";
    }
    loaded.current = value;
  }, [value]);

  useEffect(() => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older browsers */ }
    const onSel = () => {
      if (!ref.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
      const b = String(document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
      setBlock(["h2", "h3", "blockquote"].includes(b) ? b : "p");
      force((n) => n + 1);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const emit = useCallback(() => { if (ref.current) onChange(ref.current.innerHTML); }, [onChange]);
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
    force((n) => n + 1);
  };
  const is = (cmd: string) => { try { return document.queryCommandState(cmd); } catch { return false; } };

  function link() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) { window.alert("Select the words to turn into a link first."); return; }
    const range = sel.getRangeAt(0);
    const url = window.prompt("Link address (https://…)", "https://");
    if (!url || url === "https://") return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) { window.alert("Links must start with https://, mailto: or tel:"); return; }
    sel.removeAllRanges(); sel.addRange(range);
    exec("createLink", url);
  }

  const groups: Cmd[][] = [
    [
      { label: "B", title: "Bold (Ctrl+B)", run: () => exec("bold"), state: () => is("bold") },
      { label: "I", title: "Italic (Ctrl+I)", run: () => exec("italic"), state: () => is("italic") },
      { label: "U", title: "Underline (Ctrl+U)", run: () => exec("underline"), state: () => is("underline") },
      { label: "S", title: "Strikethrough", run: () => exec("strikeThrough"), state: () => is("strikeThrough") },
    ],
    [
      { label: "• List", title: "Bulleted list", run: () => exec("insertUnorderedList"), state: () => is("insertUnorderedList") },
      { label: "1. List", title: "Numbered list", run: () => exec("insertOrderedList"), state: () => is("insertOrderedList") },
      { label: "❝ Quote", title: "Quote", run: () => exec("formatBlock", block === "blockquote" ? "p" : "blockquote"), state: () => block === "blockquote" },
    ],
    [
      { label: "Link", title: "Add a link to the selected words", run: link },
      { label: "Unlink", title: "Remove link", run: () => exec("unlink") },
    ],
    [
      { label: "⇤", title: "Align left", run: () => exec("justifyLeft"), state: () => is("justifyLeft") },
      { label: "↔", title: "Centre", run: () => exec("justifyCenter"), state: () => is("justifyCenter") },
      { label: "⇥", title: "Align right", run: () => exec("justifyRight"), state: () => is("justifyRight") },
    ],
    [
      { label: "―", title: "Divider line", run: () => exec("insertHorizontalRule") },
      { label: "Clear", title: "Clear formatting on the selection", run: () => { exec("removeFormat"); exec("formatBlock", "p"); } },
      { label: "↶", title: "Undo (Ctrl+Z)", run: () => exec("undo") },
      { label: "↷", title: "Redo", run: () => exec("redo") },
    ],
  ];

  return (
    <div className="rounded-card border border-ink/15 bg-white focus-within:border-ink/40">
      <div className="flex flex-wrap items-center gap-1 border-b border-ink/10 p-2" role="toolbar" aria-label="Formatting">
        <select aria-label="Text style" value={block}
          onChange={(e) => { setBlock(e.target.value); exec("formatBlock", e.target.value); }}
          className="rounded-md border border-ink/15 bg-white px-2 py-1 text-sm text-ink">
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        {groups.map((g, i) => (
          <div key={i} className="flex items-center gap-1 border-l border-ink/10 pl-1">
            {g.map((c) => {
              const on = c.state?.() ?? false;
              return (
                <button key={c.title} type="button" title={c.title} aria-label={c.title} aria-pressed={c.state ? on : undefined}
                  onMouseDown={(e) => e.preventDefault()} onClick={c.run}
                  className={`min-w-[2rem] rounded-md px-2 py-1 text-sm ${on ? "bg-ink text-ivory" : "text-ink hover:bg-ink/5"} ${
                    c.label === "B" ? "font-bold" : c.label === "I" ? "italic" : c.label === "U" ? "underline" : c.label === "S" ? "line-through" : ""}`}>
                  {c.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData("text/html");
          const text = e.clipboardData.getData("text/plain");
          if (html) document.execCommand("insertHTML", false, cleanPastedHtml(html));
          else document.execCommand("insertText", false, text);
          emit();
        }}
        className="nl-editor min-h-[18rem] px-5 py-4 text-[15px] leading-relaxed text-ink outline-none" />
    </div>
  );
}
