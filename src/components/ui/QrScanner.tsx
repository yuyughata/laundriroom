"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera QR/barcode scanner (html5-qrcode). Opens a modal, scans a tag, and
 * returns the decoded text via onResult. Requires HTTPS (or localhost) and
 * camera permission.
 */
export function QrScanner({ onResult, label = "Scan" }: { onResult: (text: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)}>📷 {label}</button>
      {open && <ScannerModal onClose={() => setOpen(false)} onResult={(t) => { onResult(t); setOpen(false); }} />}
    </>
  );
}

function ScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !ref.current) return;
        const el = ref.current;
        el.id = el.id || "qr-reader-" + Math.random().toString(36).slice(2);
        // Use the phone's built-in QR reader where there is one (Android
        // Chrome); otherwise html5-qrcode's own decoder (zxing).
        const scanner = new Html5Qrcode(el.id, { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
        instanceRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded: string) => { onResult(decoded); },
          () => {}
        );
      } catch (e) {
        setErr("Could not start the camera. Check permissions, or type the code instead.");
      }
    })();
    return () => {
      cancelled = true;
      const inst = instanceRef.current;
      if (inst) { inst.stop().then(() => inst.clear()).catch(() => {}); }
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-medium text-ink">Scan tag</p>
          <button className="text-sm text-slate" onClick={onClose}>Close</button>
        </div>
        <div ref={ref} className="mt-3 overflow-hidden rounded-card bg-ink/5" />
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <p className="mt-2 text-xs text-slate">Point the camera at the tag&apos;s QR code.</p>
      </div>
    </div>
  );
}
