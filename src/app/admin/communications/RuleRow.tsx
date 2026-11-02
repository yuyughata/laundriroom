"use client";

import { useState, useTransition } from "react";
import { updateNotificationRule } from "../actions";
import type { NotifChannel, NotificationRule } from "@/lib/database.types";

const EVENT_LABEL: Record<string, string> = {
  order_confirmed: "Order confirmed",
  pickup_assigned: "Pickup assigned",
  checked_in: "Checked in",
  stage_complete: "Stage complete",
  ready_for_delivery: "Ready for delivery",
  out_for_delivery: "Out for delivery",
  payment_due: "Payment due",
  payment_received: "Payment received",
  order_closed: "Order closed",
  item_type_requested: "Item type requested",
  item_type_approved: "Item type approved",
  payout_sent: "Payout sent",
  email_verification: "Email verification",
  email_verification_reminder: "Verification reminder",
  password_changed: "Password changed",
  account_updated: "Account details updated",
  account_suspended: "Account suspended",
  account_reactivated: "Account reactivated",
  ticket_opened: "New support ticket",
  ticket_message: "Customer replied on ticket",
  ticket_reply: "Support replied (to customer)",
};

const CHANNELS: NotifChannel[] = ["email", "whatsapp", "sms"];

export function RuleRow({ rule, smsReady }: { rule: NotificationRule; smsReady: boolean }) {
  const [channels, setChannels] = useState<NotifChannel[]>(rule.channels);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [pending, start] = useTransition();

  function toggle(ch: NotifChannel) {
    if (ch === "sms" && !smsReady) return;
    const next = channels.includes(ch) ? channels.filter((c) => c !== ch) : [...channels, ch];
    setChannels(next);
    start(() => updateNotificationRule(rule.event, next, enabled, rule.recipients).then(() => {}));
  }
  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    start(() => updateNotificationRule(rule.event, channels, next, rule.recipients).then(() => {}));
  }

  return (
    <tr className={pending ? "opacity-60" : ""}>
      <td className="px-4 py-3 font-medium text-ink">{EVENT_LABEL[rule.event] ?? rule.event}</td>
      {CHANNELS.map((ch) => {
        const on = channels.includes(ch);
        const locked = ch === "sms" && !smsReady;
        return (
          <td key={ch} className="px-4 py-3 text-center">
            <button onClick={() => toggle(ch)} disabled={locked}
              title={locked ? "Set up an SMS provider under Integrations" : ""}
              className={`inline-flex h-6 w-11 items-center rounded-pill px-0.5 transition ${
                on ? "bg-teal" : "bg-ink/15"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition ${on ? "translate-x-5" : ""}`} />
            </button>
          </td>
        );
      })}
      <td className="px-4 py-3 text-slate text-xs">{rule.recipients.join(", ")}</td>
      <td className="px-4 py-3 text-center">
        <button onClick={toggleEnabled}
          className={enabled ? "chip-ok" : "chip-muted"}>{enabled ? "On" : "Off"}</button>
      </td>
    </tr>
  );
}
