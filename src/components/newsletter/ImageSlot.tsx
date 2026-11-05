"use client";

import { useRef, useState } from "react";
import { createClient as createBrowser } from "@/lib/supabase/client";

const MAX_W = 1200;          // emails show images at 560px; 2× keeps them sharp
const MAX_BYTES = 5 * 1024 * 1024;

/** Shrink to 1200px wide (JPEG for photos, PNG kept for transparency, GIF untouched). */
async function prepare(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  if (bmp.width <= MAX_W && file.size <= 1.2 * 1024 * 1024) return file;
  const scale = Math.min(1, MAX_W / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return await new Promise((res) => c.toBlob((b) => res(b ?? file), type, 0.86));
}

/** Header / footer image: upload, replace or remove. Stored in the public newsletter-images bucket. */
export function ImageSlot({ label, hint, url, onChange }: {
  label: string; hint: string; url: string | null; onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Choose an image (JPG, PNG, WebP or GIF)."); return; }
    setBusy(true);
    try {
      const blob = await prepare(file);
      if (blob.size > MAX_BYTES) { setErr("That image is over 5 MB. Choose a smaller one."); return; }
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
      const path = `newsletters/${crypto.randomUUID()}.${ext}`;
      const sb = createBrowser();
      const { error } = await sb.storage.from("newsletter-images").upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) { setErr(`Upload failed: ${error.message}`); return; }
      onChange(sb.storage.from("newsletter-images").getPublicUrl(path).data.publicUrl);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{label}</p>
          <p className="text-xs text-slate">{hint}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </button>
          {url && <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => onChange(null)}>Remove</button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="mt-3 max-h-40 w-full rounded-lg border border-ink/10 object-cover" />
      ) : (
        <button type="button" onClick={() => input.current?.click()}
          className="mt-3 flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-ink/20 text-sm text-slate hover:bg-ink/5">
          No image — the email {label.toLowerCase().startsWith("header") ? "starts with a gold line" : "ends after the button"}
        </button>
      )}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
