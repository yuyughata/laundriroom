"use client";

import { useTransition } from "react";
import { deleteReview } from "./actions";

export function DeleteReview({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost border-danger/30 px-3 py-1.5 text-xs text-danger" disabled={pending}
      onClick={() => { if (confirm("Remove this review?")) start(() => deleteReview(id).then(() => {})); }}>
      Remove
    </button>
  );
}
