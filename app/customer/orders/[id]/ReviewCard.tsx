"use client";

import { useState, useTransition } from "react";
import { submitReview } from "../../actions";
import { Stars } from "@/components/ui/Stars";

export function ReviewCard({ orderId, vendorId }: { orderId: string; vendorId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="card p-5 text-center">
        <p className="font-medium text-ink">Thanks for your feedback!</p>
        <div className="mt-2 flex justify-center"><Stars value={rating} size={20} /></div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="card p-5">
      <p className="font-medium text-ink">How was your experience?</p>
      <p className="text-xs text-slate">Your rating helps other customers choose.</p>

      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" className="p-1"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)} aria-label={`${i} star${i > 1 ? "s" : ""}`}>
            <svg width="30" height="30" viewBox="0 0 24 24"
              fill={i <= shown ? "#C6A664" : "none"} stroke="#C6A664" strokeWidth="1.5">
              <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea className="field mt-3" rows={3} placeholder="Add a comment (optional)"
        value={comment} onChange={(e) => setComment(e.target.value)} />

      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <button className="btn-accent mt-3 w-full" disabled={pending || rating === 0}
        onClick={() => start(async () => {
          setErr(null);
          const r = await submitReview(orderId, vendorId, rating, comment);
          if (r?.error) setErr(r.error); else setDone(true);
        })}>
        {rating === 0 ? "Tap a star to rate" : "Submit review"}
      </button>
    </div>
  );
}
