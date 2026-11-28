/**
 * Floating WhatsApp contact button for the marketing homepage, with an
 * expanding pulse-ring motion effect. Pure anchor + CSS (no client JS). The
 * number comes from NEXT_PUBLIC_WHATSAPP_NUMBER (international format, digits
 * only, e.g. 2348012345678); the default message is prefilled via ?text=.
 */
export function WhatsAppFab({
  phone,
  message = "Hi, my name is..... I'd like to inquire about...",
}: {
  phone: string;
  message?: string;
}) {
  const digits = phone.replace(/[^\d]/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <a
        className="wa-fab"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with laundriroom on WhatsApp"
      >
        <span className="wa-ring" aria-hidden="true" />
        <span className="wa-ring wa-ring-2" aria-hidden="true" />
        <span className="wa-tip" aria-hidden="true">Chat with us</span>
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <path
            fill="#fff"
            d="M16.003 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.59 4.47 1.72 6.42L3.2 28.8l6.56-1.72a12.74 12.74 0 0 0 6.24 1.62h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.64-3.75-9.06a12.72 12.72 0 0 0-9.06-3.64zm0 23.3h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4 1.05 1.07-3.9-.25-.4a10.56 10.56 0 0 1-1.62-5.64c0-5.86 4.77-10.63 10.63-10.63 2.84 0 5.5 1.11 7.51 3.12a10.55 10.55 0 0 1 3.11 7.52c0 5.86-4.77 10.63-10.63 10.63zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55-.18-.01-.4-.01-.61-.01-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z"
          />
        </svg>
      </a>
    </>
  );
}

const css = `
.wa-fab{position:fixed;right:24px;bottom:94px;z-index:61;width:58px;height:58px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 26px rgba(37,211,102,.45),0 4px 10px rgba(15,27,45,.2);cursor:pointer;animation:wa-bob 2.6s ease-in-out infinite}
.wa-ring{position:absolute;inset:0;border-radius:50%;background:#25D366;z-index:-1;animation:wa-pulse 2s cubic-bezier(.3,0,.3,1) infinite}
.wa-ring-2{animation-delay:1s}
.wa-fab svg{position:relative;z-index:1}
.wa-tip{position:absolute;right:70px;background:#0F1B2D;color:#F8F5EF;font-family:var(--font-inter,system-ui,sans-serif);font-size:13px;font-weight:600;white-space:nowrap;padding:8px 12px;border-radius:10px;opacity:0;transform:translateX(6px);pointer-events:none;transition:opacity .18s,transform .18s;box-shadow:0 8px 22px rgba(15,27,45,.22)}
.wa-tip:after{content:"";position:absolute;right:-5px;top:50%;transform:translateY(-50%);border-left:6px solid #0F1B2D;border-top:5px solid transparent;border-bottom:5px solid transparent}
.wa-fab:hover .wa-tip{opacity:1;transform:translateX(0)}
.wa-fab:hover{animation-play-state:paused}
@keyframes wa-pulse{0%{transform:scale(1);opacity:.55}70%{transform:scale(1.9);opacity:0}100%{transform:scale(1.9);opacity:0}}
@keyframes wa-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@media (max-width:640px){.wa-fab{right:16px;bottom:84px;width:54px;height:54px}.wa-tip{display:none}}
@media (prefers-reduced-motion:reduce){.wa-fab,.wa-ring,.wa-ring-2{animation:none}}
`;
