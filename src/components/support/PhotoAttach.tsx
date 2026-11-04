"use client";

import { useEffect, useMemo } from "react";
import { createClient as createBrowser } from "@/lib/supabase/client";

export const MAX_SUPPORT_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Optional photos on a support message: pick up to 4, see thumbnails, remove
 * any. The parent keeps the files and calls uploadSupportPhotos() on send.
 */
export function PhotoAttach({ files, onChange, dark = false }: {
  files: File[]; onChange: (f: File[]) => void; dark?: boolean;
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const full = files.length >= MAX_SUPPORT_PHOTOS;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative h-16 w-16 overflow-hidden rounded-lg border border-ink/10 bg-ivory">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" aria-label={`Remove photo ${i + 1}`}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-xs text-ivory"
              onClick={() => onChange(files.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        {!full && (
          <label className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${dark ? "border-ivory/30 text-ivory/80" : "border-ink/15 text-ink"}`}>
            📷 {files.length ? "Add another photo" : "Add a photo (optional)"}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
                onChange([...files, ...picked].slice(0, MAX_SUPPORT_PHOTOS));
                e.target.value = "";
              }} />
          </label>
        )}
      </div>
      {files.length > 0 && (
        <p className={`mt-1 text-xs ${dark ? "text-ivory/60" : "text-slate"}`}>
          {files.length} of {MAX_SUPPORT_PHOTOS} photos · large photos are made smaller before sending
        </p>
      )}
    </div>
  );
}

/** Shrink a photo to at most 1600px on its long side (JPEG). Falls back to the original. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Upload photos to the private support-attachments bucket under the signed-in
 * user's own folder. Returns the storage paths, or an error message.
 */
export async function uploadSupportPhotos(files: File[]): Promise<{ paths: string[] } | { error: string }> {
  if (!files.length) return { paths: [] };
  const sb = createBrowser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in again to attach photos." };
  const paths: string[] = [];
  for (const f of files.slice(0, MAX_SUPPORT_PHOTOS)) {
    const blob = await shrink(f);
    if (blob.size > MAX_BYTES) return { error: `“${f.name}” is too large (max 5 MB).` };
    const ext = blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("support-attachments")
      .upload(path, blob, { contentType: blob.type || f.type, upsert: false });
    if (error) return { error: `Couldn’t upload “${f.name}”: ${error.message}` };
    paths.push(path);
  }
  return { paths };
}
