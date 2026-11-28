"use client";

import { useState, useTransition } from "react";
import { subscribeMailingList } from "@/lib/subscribeActions";

/**
 * Homepage mailing-list capture. Email required, phone optional. Posts to the
 * `subscribeMailingList` server action (stored in `mailing_list`, admin-read).
 * Self-styled (scoped `.lr-sub`) so it matches the Ink & Ivory landing page
 * without depending on the injected landing CSS.
 */
export function MailingListForm() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="lr-sub">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="lr-sub-wrap">
        <div className="lr-sub-card">
          <h2 className="lr-sub-h">Be the first to hear about discount promos and great deals!</h2>
          <p className="lr-sub-p">
            Join the laundriroom list — new-customer offers, seasonal discounts and deals, straight to your inbox.
          </p>

          {done ? (
            <p className="lr-sub-ok" role="status">
              🎉 You&apos;re on the list! We&apos;ll be in touch with the good stuff.
            </p>
          ) : (
            <form
              className="lr-sub-form"
              action={(fd) =>
                start(async () => {
                  setErr(null);
                  const r = await subscribeMailingList(fd);
                  if (r?.error) setErr(r.error);
                  else setDone(true);
                })
              }
            >
              <div className="lr-sub-row">
                <label className="lr-sub-field">
                  <span>Email <em>*</em></span>
                  <input name="email" type="email" required autoComplete="email" placeholder="you@email.com" />
                </label>
                <label className="lr-sub-field">
                  <span>Phone number <small>(optional)</small></span>
                  <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="080…" />
                </label>
              </div>
              <button className="lr-sub-btn" disabled={pending}>
                {pending ? "Signing you up…" : "Keep me posted"}
              </button>
              {err && <p className="lr-sub-err">{err}</p>}
              <p className="lr-sub-fine">No spam. Unsubscribe any time.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

const css = `
.lr-sub{background:#F8F5EF;padding:64px 20px}
.lr-sub-wrap{max-width:1160px;margin:0 auto}
.lr-sub-card{position:relative;overflow:hidden;background:linear-gradient(165deg,#14233a,#0F1B2D 60%);color:#F8F5EF;border-radius:24px;padding:44px 40px;box-shadow:0 18px 50px rgba(15,27,45,.18)}
.lr-sub-card:before{content:"";position:absolute;top:-120px;right:-80px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(198,166,100,.22),transparent 70%)}
.lr-sub-h{position:relative;z-index:1;font-family:var(--font-fraunces,'Fraunces',Georgia,serif);font-weight:600;font-size:30px;line-height:1.15;letter-spacing:-.01em;max-width:620px}
.lr-sub-p{position:relative;z-index:1;color:rgba(248,245,239,.74);font-size:16px;margin-top:12px;max-width:560px}
.lr-sub-form{position:relative;z-index:1;margin-top:24px}
.lr-sub-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.lr-sub-field{display:flex;flex-direction:column;gap:6px}
.lr-sub-field>span{font-size:12.5px;color:rgba(248,245,239,.7)}
.lr-sub-field em{color:#D8BE86;font-style:normal}
.lr-sub-field small{color:rgba(248,245,239,.5)}
.lr-sub-field input{background:rgba(248,245,239,.06);border:1px solid rgba(248,245,239,.18);color:#fff;border-radius:12px;padding:13px 14px;font-size:15px;outline:none;transition:border-color .15s,background .15s}
.lr-sub-field input::placeholder{color:rgba(248,245,239,.4)}
.lr-sub-field input:focus{border-color:#C6A664;background:rgba(248,245,239,.1)}
.lr-sub-btn{margin-top:16px;width:100%;background:#C6A664;color:#0F1B2D;font-weight:700;font-size:15.5px;border:none;border-radius:999px;padding:14px 22px;cursor:pointer;transition:transform .12s,box-shadow .2s,opacity .2s;box-shadow:0 8px 22px rgba(198,166,100,.34)}
.lr-sub-btn:hover{transform:translateY(-1px)}
.lr-sub-btn:disabled{opacity:.7;cursor:default;transform:none}
.lr-sub-err{color:#F0B8B2;font-size:13px;margin-top:10px}
.lr-sub-fine{color:rgba(248,245,239,.5);font-size:12px;margin-top:12px}
.lr-sub-ok{position:relative;z-index:1;margin-top:20px;background:rgba(95,179,168,.16);border:1px solid rgba(95,179,168,.4);color:#CDEDE8;border-radius:14px;padding:16px 18px;font-size:15.5px;font-weight:600}
@media (max-width:640px){
  .lr-sub{padding:44px 16px}
  .lr-sub-card{padding:32px 22px}
  .lr-sub-h{font-size:24px}
  .lr-sub-row{grid-template-columns:1fr}
}
`;
