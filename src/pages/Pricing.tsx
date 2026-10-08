import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { RallyPage } from "@/components/layout/RallyPage";
import { Footer } from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCosts } from "@/components/billing/CreditCosts";
import { IntervalToggle } from "@/components/billing/IntervalToggle";
import { PlanGrid } from "@/components/billing/PlanGrid";
import { usePlanCatalogue } from "@/hooks/useBilling";
import { formatRupees } from "@/utils/money";
import type { BillingInterval } from "@/types/billing";

/**
 * The public pricing page. Signed-in members are sent to Plans & billing, where
 * the same plans can actually be bought; everyone else sees them with a way to
 * start the free trial, which needs no card.
 */
export default function Pricing() {
  const { session, loading } = useAuth();
  const catalogue = usePlanCatalogue();
  const [interval, setInterval] = useState<BillingInterval>("yearly");

  if (!loading && session) return <Navigate to="/billing" replace />;

  const trial = catalogue.data?.plans.find((p) => p.id === "trial");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <RallyPage
          title="Pricing"
          description={
            trial
              ? `Start with a ${catalogue.data?.trialDays}-day free trial and ${trial.limits.monthlyCredits} AI credits. No card needed.`
              : "Simple plans that grow with how much you create."
          }
          actions={<IntervalToggle value={interval} onChange={setInterval} />}
        >
          {catalogue.isError ? (
            <div className="rd-panel p-8 text-center" role="alert">
              <p className="text-[15px] font-semibold">We could not load the plans.</p>
              <button
                type="button"
                onClick={() => void catalogue.refetch()}
                className="mt-3 text-sm font-semibold text-rl-strong underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          ) : !catalogue.data ? (
            <div className="grid gap-5 md:grid-cols-3" aria-busy="true" aria-label="Loading plans">
              <Skeleton className="h-96 rounded-[18px]" />
              <Skeleton className="h-96 rounded-[18px]" />
              <Skeleton className="h-96 rounded-[18px]" />
            </div>
          ) : (
            <div className="space-y-10">
              <PlanGrid
                catalogue={catalogue.data}
                interval={interval}
                publicMode
                renderSignup={(className, label) => (
                  <Link to="/register" className={className}>
                    {label}
                  </Link>
                )}
              />

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <CreditCosts costs={catalogue.data.creditCosts} />
                <section className="rd-panel p-6 sm:p-7" aria-labelledby="faq-heading">
                  <h2 id="faq-heading" className="text-lg font-bold tracking-tight">
                    Good to know
                  </h2>
                  <dl className="mt-4 space-y-4 text-[14px] leading-relaxed">
                    <div>
                      <dt className="font-semibold">Do unused credits roll over?</dt>
                      <dd className="text-rl-muted">
                        Monthly credits reset each period. Credits you buy as a pack never expire.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">What if a creative fails?</dt>
                      <dd className="text-rl-muted">You are not charged. The credits are returned automatically.</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Can I need more credits mid-month?</dt>
                      <dd className="text-rl-muted">
                        Add {catalogue.data.topupPack.credits} credits for{" "}
                        {formatRupees(catalogue.data.topupPack.pricePaise)}, or move up a plan.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Can I cancel?</dt>
                      <dd className="text-rl-muted">
                        Any time. You keep access until the end of the period you paid for.
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          )}
        </RallyPage>
      </main>
      <Footer />
    </div>
  );
}
