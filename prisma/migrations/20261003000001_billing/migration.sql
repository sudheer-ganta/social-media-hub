-- Billing: subscriptions, credit balance + append-only ledger, payments, and
-- webhook idempotency. Additive. Server-only tables: RLS is enabled with no
-- policies, so PostgREST (the SPA's anon/authenticated roles) can read none of
-- it; the backend connects as the owner and bypasses RLS.

CREATE TYPE "public"."subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'HALTED', 'CANCELED', 'EXPIRED');
CREATE TYPE "public"."credit_entry_type" AS ENUM ('TRIAL_GRANT', 'PLAN_GRANT', 'TOPUP_GRANT', 'SPEND', 'REFUND', 'EXPIRE', 'ADJUSTMENT');

CREATE TABLE "public"."subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "plan_id" TEXT NOT NULL,
  "billing_interval" TEXT,
  "status" "public"."subscription_status" NOT NULL,
  "trial_ends_at" TIMESTAMPTZ(6),
  "current_period_start" TIMESTAMPTZ(6),
  "current_period_end" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "canceled_at" TIMESTAMPTZ(6),
  "razorpay_customer_id" TEXT,
  "razorpay_subscription_id" TEXT,
  "checkout_subscription_id" TEXT,
  "checkout_plan_id" TEXT,
  "checkout_interval" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_interval_check" CHECK ("billing_interval" IS NULL OR "billing_interval" IN ('monthly', 'yearly'))
);
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "public"."subscriptions"("user_id");
CREATE UNIQUE INDEX "subscriptions_razorpay_subscription_id_key" ON "public"."subscriptions"("razorpay_subscription_id");
CREATE UNIQUE INDEX "subscriptions_checkout_subscription_id_key" ON "public"."subscriptions"("checkout_subscription_id");

CREATE TABLE "public"."credit_accounts" (
  "user_id" UUID NOT NULL,
  "plan_credits" INTEGER NOT NULL DEFAULT 0,
  "topup_credits" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("user_id"),
  -- The overspend backstop: whatever the application does, a balance can never
  -- be driven below zero.
  CONSTRAINT "credit_accounts_non_negative" CHECK ("plan_credits" >= 0 AND "topup_credits" >= 0)
);

CREATE TABLE "public"."credit_ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "public"."credit_entry_type" NOT NULL,
  "plan_delta" INTEGER NOT NULL DEFAULT 0,
  "topup_delta" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT,
  "request_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_ledger_entries_idempotency_key_key" ON "public"."credit_ledger_entries"("idempotency_key");
CREATE INDEX "credit_ledger_entries_user_id_created_at_idx" ON "public"."credit_ledger_entries"("user_id", "created_at" DESC);

CREATE TABLE "public"."billing_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "razorpay_payment_id" TEXT NOT NULL,
  "razorpay_order_id" TEXT,
  "razorpay_subscription_id" TEXT,
  "razorpay_invoice_id" TEXT,
  "kind" TEXT NOT NULL,
  "plan_id" TEXT,
  "amount_paise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_kind_check" CHECK ("kind" IN ('subscription', 'topup'))
);
CREATE UNIQUE INDEX "billing_payments_razorpay_payment_id_key" ON "public"."billing_payments"("razorpay_payment_id");
CREATE INDEX "billing_payments_user_id_created_at_idx" ON "public"."billing_payments"("user_id", "created_at" DESC);

CREATE TABLE "public"."billing_webhook_events" (
  "id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "error" TEXT,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "billing_webhook_events_event_type_received_at_idx" ON "public"."billing_webhook_events"("event_type", "received_at" DESC);

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_webhook_events" ENABLE ROW LEVEL SECURITY;
