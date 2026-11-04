/**
 * Hand-maintained schema types mirroring supabase/migrations.
 * Regenerate from a live project with:  npm run db:types
 * (supabase gen types typescript). Kept in sync by hand until then.
 */

export type UserRole =
  | "customer" | "attendant" | "vendor_manager" | "rider" | "platform_admin" | "support_agent";
export type VendorStatus = "pending" | "verified" | "suspended" | "rejected";
export type DeliveryMode = "own_riders" | "dispatch_partner" | "both";
export type PlanType = "commission" | "subscription" | "combined";
export type ServiceType = "wash_and_fold" | "dry_clean" | "press_only";
export type ServiceTier = "standard" | "premium";
export type Turnaround = "normal" | "express";
export type EntryMode = "pickup" | "drop_off";
export type ReturnMode = "delivery" | "collection";
export type DeliveredBy = "own_rider" | "dispatch_partner";
export type PaymentTiming = "online" | "on_delivery";
export type OrderStatus =
  | "awaiting_dropoff" | "pickup_requested" | "checked_in" | "processing"
  | "ready" | "out_for_delivery" | "awaiting_collection" | "closed" | "cancelled";
export type OrderItemStatus = "checked_in" | "processing" | "done" | "packaged" | "handed_over";
export type StageKind =
  | "check_in" | "sorting" | "washing" | "drying" | "pressing" | "quality_check"
  | "packaging" | "final_completion" | "out_for_delivery" | "handover";
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type PaymentMethod = "paystack" | "flutterwave" | "manual";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PayoutStatus = "held" | "due" | "processing" | "sent" | "failed";
export type TagStatus = "free" | "in_use" | "retired" | "missing" | "damaged";
export type RequestStatus = "pending" | "approved" | "rejected";
export type NotifChannel = "email" | "whatsapp" | "sms";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high";
export type IntegrationProvider = "resend" | "whatsapp" | "sms";
export type IntegrationStatus = "not_configured" | "connected" | "error";

// Matches supabase-js GenericTable: Row/Insert/Update + Relationships.
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export type Profile = {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: UserRole; status: "active" | "suspended" | "invited";
  email_verified: boolean; verify_reminders_sent: number;
  referral_code: string | null; referred_by: string | null;
  created_at: string; updated_at: string;
}
export type ClaimType = "damage" | "loss";
export type ClaimStatus = "open" | "investigating" | "approved" | "rejected" | "resolved";
export type Claim = {
  id: string; number: number; order_id: string; order_item_id: string | null;
  customer_id: string; vendor_id: string; type: ClaimType; description: string;
  status: ClaimStatus; resolution_note: string | null; compensation: number;
  resolved_by: string | null; created_at: string; updated_at: string;
};
export type PromoCode = {
  id: string; code: string; discount_type: "percent" | "fixed"; value: number;
  max_discount: number | null; min_order: number; usage_limit: number | null;
  used_count: number; per_customer_limit: number; owner_id: string | null;
  vendor_id: string | null;
  active: boolean; starts_at: string | null; expires_at: string | null; created_at: string;
};
export type Referral = {
  id: string; referrer_id: string; referee_id: string;
  status: "pending" | "qualified" | "rewarded"; reward_promo_id: string | null;
  created_at: string; qualified_at: string | null;
};
export type Vendor = {
  id: string; name: string; status: VendorStatus; delivery: DeliveryMode;
  plan_id: string | null; address_line: string | null; area: string | null; city: string | null;
  lat: number | null; lng: number | null; service_radius_km: number;
  opens_at: string | null; closes_at: string | null; is_open: boolean;
  kyc_verified: boolean; terms_accepted_at: string | null;
  /** Shareable profile link name: /v/<slug> (auto-generated, admin-only to change). */
  slug: string;
  created_at: string; updated_at: string;
}
export type VendorPlan = {
  id: string; name: string; type: PlanType; commission_rate: number;
  monthly_fee: number; is_default: boolean; active: boolean; created_at: string;
}
export type ItemType = {
  id: string; name: string; icon: string | null; is_global: boolean;
  vendor_id: string | null; active: boolean; created_at: string;
}
export type PriceListRow = {
  id: string; vendor_id: string; item_type_id: string; service: ServiceType;
  price: number; currency: string; active: boolean; created_at: string;
}
export type Order = {
  id: string; code: string; customer_id: string; vendor_id: string;
  entry_mode: EntryMode; return_mode: ReturnMode; delivered_by: DeliveredBy | null;
  payment_timing: PaymentTiming; service_tier: ServiceTier; turnaround: Turnaround;
  status: OrderStatus;
  delivery_fee: number; express_fee: number; premium_fee: number;
  reschedule_penalty: number; delivery_attempts: number;
  items_total: number; extras_total: number; bulk_discount: number; total: number;
  handover_code: string | null; pickup_code: string | null; picked_up_at: string | null; picked_up_by?: string | null;
  dispatch_reference: string | null; rider_name: string | null; rider_phone: string | null;
  created_by: string | null;
  /** Placed from the vendor's public profile link. */
  via_vendor_link: boolean;
  /** The branch (shop location) handling the order. */
  branch_id: string;
  promo_code: string | null; discount: number;
  discount_type: "percent" | "fixed" | null; discount_value: number | null; discount_max: number | null;
  pickup_address_id: string | null; notes: string | null;
  created_at: string; checked_in_at: string | null; ready_at: string | null;
  completed_at: string | null; closed_at: string | null;
  cancelled_at: string | null; cancel_reason: string | null;
}
export type OrderItem = {
  id: string; order_id: string; sub_code: string; item_type_id: string;
  service: ServiceType; price_at_checkin: number; customer_comment: string | null;
  condition_notes: string | null; checked_in_by?: string | null;
  tag_code: string | null; status: OrderItemStatus; photos: string[]; created_at: string;
}
export type StageEvent = {
  id: string; order_id: string; stage: StageKind; pressed_by: string | null;
  skipped: boolean; note: string | null; created_at: string;
}
export type Payment = {
  id: string; order_id: string; invoice_id: string | null; amount: number;
  method: PaymentMethod; status: PaymentStatus; reference: string | null;
  paid_at: string | null; created_at: string;
}
export type Payout = {
  id: string; vendor_id: string; order_ids: string[]; gross: number; fee: number;
  net: number; due_at: string; status: PayoutStatus; reference: string | null;
  transfer_code: string | null; failure_reason: string | null; processed_at: string | null;
  sent_at: string | null; created_at: string;
}
export type VendorPayoutAccount = {
  vendor_id: string; bank_code: string; bank_name: string | null;
  account_number: string; account_name: string | null; recipient_code: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export type Tag = {
  id: string; code: string; batch: string | null; status: TagStatus;
  vendor_id: string | null; current_item_id: string | null; created_at: string;
  /** Printable batches (migration 0036). */
  batch_id: string | null; serial: number | null; print_count: number; last_printed_at: string | null;
  status_note: string | null; status_changed_at: string | null;
}
/** A generated batch of printable tags (migration 0036). */
export type TagBatch = {
  id: string; vendor_id: string; prefix: string; first_serial: number; last_serial: number; quantity: number;
  created_by: string | null; created_at: string; print_count: number; last_printed_at: string | null;
}
export type ItemTypeRequest = {
  id: string; vendor_id: string; requested_by: string; item_name: string;
  service: ServiceType | null; price: number | null; status: RequestStatus;
  approved_by: string | null; decided_at: string | null; created_at: string;
}
export type NotificationRule = {
  id: string; event: string; channels: NotifChannel[]; fallback_order: NotifChannel[];
  recipients: string[]; enabled: boolean; updated_at: string;
}
export type IntegrationSetting = {
  id: string; provider: IntegrationProvider; status: IntegrationStatus;
  secret_ref: string | null; config: Record<string, unknown>;
  last_test_at: string | null; last_test_ok: boolean | null;
  changed_by: string | null; updated_at: string;
}
export type ServiceExtra = {
  id: string; name: string; description: string | null;
  price: number; active: boolean; created_at: string;
};
export type OrderExtra = {
  id: string; order_id: string; extra_id: string | null;
  name: string; price: number; created_at: string;
};
export type PlatformSettings = {
  id: boolean; express_pct: number; premium_pct: number;
  noncollection_penalty_pct: number; payment_provider: "paystack" | "flutterwave";
  referral_reward: number;
  bulk_min_items: number; bulk_discount_pct: number;
  updated_at: string;
};
export type VendorDocType = "id" | "cac" | "other";
export type VendorDocument = {
  id: string; vendor_id: string; type: VendorDocType; file_path: string;
  original_name: string | null; status: "pending" | "approved" | "rejected";
  note: string | null; uploaded_by: string | null; reviewed_by: string | null;
  created_at: string; updated_at: string;
};
export type LedgerEntry = {
  id: string; vendor_id: string; type: "income" | "expense" | "adjustment";
  amount: number; order_id: string | null; reason: string | null;
  receipt_path: string | null; created_by: string | null; created_at: string;
};
export type DeliveryFeeRule = {
  id: string; scope: "global" | "zone" | "vendor"; vendor_id: string | null;
  zone: string | null; type: "flat" | "distance_band";
  flat_amount: number | null; bands: unknown; active: boolean; created_at: string;
}
export type VendorMembership = {
  id: string; vendor_id: string; profile_id: string; role: UserRole; created_at: string;
  /** NULL = business-wide (all branches); set = this branch only. */
  branch_id: string | null;
}
/** A customer's saved address (pickup / delivery). lat/lng are set when Google Maps places it. */
export type CustomerAddress = {
  id: string; customer_id: string; label: string; line1: string; area: string | null; city: string | null;
  lat: number | null; lng: number | null; is_default: boolean; created_at: string;
}
/** A vendor's shop location (migration 0033). Orders and branch staff belong to one. */
export type Branch = {
  id: string; vendor_id: string; name: string; is_main: boolean; active: boolean;
  phone: string | null; address_line: string | null; area: string | null; city: string | null;
  lat: number | null; lng: number | null; service_radius_km: number;
  opens_at: string; closes_at: string; is_open: boolean;
  created_at: string; updated_at: string;
}
export type NotificationTemplate = {
  id: string; event: string; channel: NotifChannel;
  subject: string | null; body: string; updated_at: string;
}
export type OrderSummary = {
  id: string; code: string; status: OrderStatus; entry_mode: EntryMode;
  return_mode: ReturnMode; payment_timing: PaymentTiming;
  service_tier: ServiceTier; turnaround: Turnaround; total: number;
  delivery_fee: number; created_at: string; ready_at: string | null; closed_at: string | null;
  vendor_id: string; vendor_name: string; customer_id: string; customer_name: string;
  item_count: number; is_paid: boolean;
  branch_id?: string; branch_name?: string | null;
}

export type SupportTicket = {
  id: string; number: number; customer_id: string; order_id: string | null;
  category: string; subcategory: string | null; other_text: string | null;
  subject: string; status: TicketStatus; priority: TicketPriority;
  assigned_to: string | null; created_at: string; updated_at: string;
};
export type SupportMessage = {
  id: string; ticket_id: string; author_id: string | null;
  from_support: boolean; body: string; created_at: string;
  /** Storage paths in the support-attachments bucket (0039). */
  attachments?: string[];
};
export type Review = {
  id: string; order_id: string; customer_id: string; vendor_id: string;
  rating: number; comment: string | null; created_at: string;
};
export type VendorRating = {
  vendor_id: string; avg_rating: number; review_count: number;
};
export type VendorApplication = {
  id: string; number: number; business_name: string; contact_name: string;
  email: string; phone: string; area: string | null; city: string | null;
  delivery: DeliveryMode; message: string | null;
  status: "pending" | "approved" | "rejected";
  agreed_terms: boolean; agreed_at: string | null;
  vendor_id: string | null; reviewed_by: string | null; created_at: string; updated_at: string;
};
export type UserDirectoryRow = {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: UserRole; status: "active" | "suspended" | "invited"; email_verified: boolean;
  created_at: string; vendor_id: string | null; vendor_name: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      vendors: Table<Vendor>;
      vendor_plans: Table<VendorPlan>;
      item_types: Table<ItemType>;
      price_list: Table<PriceListRow>;
      orders: Table<Order>;
      order_items: Table<OrderItem>;
      stage_events: Table<StageEvent>;
      payments: Table<Payment>;
      payouts: Table<Payout>;
      tags: Table<Tag>;
      item_type_requests: Table<ItemTypeRequest>;
      notification_rules: Table<NotificationRule>;
      notification_templates: Table<NotificationTemplate>;
      integration_settings: Table<IntegrationSetting>;
      delivery_fee_rules: Table<DeliveryFeeRule>;
      vendor_memberships: Table<VendorMembership>;
      branches: Table<Branch>;
      customer_addresses: Table<CustomerAddress>;
      service_extras: Table<ServiceExtra>;
      order_extras: Table<OrderExtra>;
      platform_settings: Table<PlatformSettings>;
      support_tickets: Table<SupportTicket>;
      support_messages: Table<SupportMessage>;
      reviews: Table<Review>;
      ledger_entries: Table<LedgerEntry>;
      claims: Table<Claim>;
      promo_codes: Table<PromoCode>;
      referrals: Table<Referral>;
      vendor_applications: Table<VendorApplication>;
      vendor_documents: Table<VendorDocument>;
      vendor_payout_accounts: Table<VendorPayoutAccount>;
    };
    Views: {
      order_summaries: { Row: OrderSummary; Relationships: [] };
      user_directory: { Row: UserDirectoryRow; Relationships: [] };
      vendor_ratings: { Row: VendorRating; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
