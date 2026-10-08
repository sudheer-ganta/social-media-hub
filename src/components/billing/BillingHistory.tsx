import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import { formatRupees } from "@/utils/money";
import type { BillingHistory as History, CreditLedgerRow } from "@/types/billing";

const CREDIT_LABEL: Record<CreditLedgerRow["type"], string> = {
  TRIAL_GRANT: "Free trial credits",
  PLAN_GRANT: "Monthly credits",
  TOPUP_GRANT: "Credits bought",
  SPEND: "Used",
  REFUND: "Refunded (it did not complete)",
  EXPIRE: "Unused credits expired",
  ADJUSTMENT: "Adjustment",
};

const ACTION_LABEL: Record<string, string> = {
  concepts: "creative ideas",
  generate: "full creative",
  refine: "refine",
  regenerate: "regenerate",
  campaignVariation: "campaign",
};

function creditLine(row: CreditLedgerRow): string {
  const base = CREDIT_LABEL[row.type];
  const action = row.action ? ACTION_LABEL[row.action] : undefined;
  return (row.type === "SPEND" || row.type === "REFUND") && action ? `${base}: ${action}` : base;
}

function paymentLine(kind: "subscription" | "topup", planId: string | null): string {
  if (kind === "topup") return "Credit pack";
  return planId ? `${planId.charAt(0).toUpperCase()}${planId.slice(1)} plan` : "Subscription";
}

const Empty = ({ children }: { children: string }) => (
  <p className="py-8 text-center text-sm text-rl-muted">{children}</p>
);

export function BillingHistory({ history }: { history?: History }) {
  const payments = history?.payments ?? [];
  const credits = (history?.credits ?? []).filter((row) => row.planDelta !== 0 || row.topupDelta !== 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rd-panel p-6 sm:p-7" aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-bold tracking-tight">
          Payments
        </h2>
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <ul className="mt-4 divide-y divide-rl-line/80">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold">{paymentLine(payment.kind, payment.planId)}</p>
                  <p className="text-[13px] text-rl-muted">{dayjs(payment.createdAt).format("D MMM YYYY")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14.5px] font-semibold tabular-nums">{formatRupees(payment.amountPaise)}</p>
                  {payment.status !== "captured" && (
                    <p className="text-[12px] capitalize text-rl-strong">{payment.status}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rd-panel p-6 sm:p-7" aria-labelledby="credits-heading">
        <h2 id="credits-heading" className="text-lg font-bold tracking-tight">
          Credit activity
        </h2>
        {credits.length === 0 ? (
          <Empty>No credit activity yet.</Empty>
        ) : (
          <ul className="mt-4 divide-y divide-rl-line/80">
            {credits.map((row) => {
              const delta = row.planDelta + row.topupDelta;
              return (
                <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-semibold">{creditLine(row)}</p>
                    <p className="text-[13px] text-rl-muted">{dayjs(row.createdAt).format("D MMM, h:mm A")}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[14.5px] font-bold tabular-nums",
                      delta > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rl-muted",
                    )}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
