/** Thumbnails of a support message's photos; each opens full size in a new tab. */
export function MessagePhotos({ paths, urls }: { paths?: string[]; urls: Record<string, string> }) {
  const shown = (paths ?? []).filter((p) => urls[p]);
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {shown.map((p, i) => (
        <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer"
          className="block h-24 w-24 overflow-hidden rounded-lg border border-ink/10 bg-ivory">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[p]} alt={`Attached photo ${i + 1}`} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}
