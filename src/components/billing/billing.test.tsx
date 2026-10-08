/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingHistory } from "./BillingHistory";
import { CreditCosts } from "./CreditCosts";
import { CurrentPlanPanel, describeState } from "./CurrentPlanPanel";
import { IntervalToggle } from "./IntervalToggle";
import { PlanGrid, actionFor } from "./PlanGrid";
import { CATALOGUE, HISTORY, OVERVIEWS } from "./fixtures";

afterEach(cleanup);

const plan = (id: string) => CATALOGUE.plans.find((p) => p.id === id)!;

describe("actionFor", () => {
  it("sends every public visitor to sign up", () => {
    expect(actionFor(plan("pro"), "monthly", undefined, true)).toEqual({ kind: "signup" });
  });

  it("lets a trial member subscribe to any paid plan", () => {
    for (const id of ["starter", "pro", "agency"]) {
      expect(actionFor(plan(id), "yearly", OVERVIEWS.trialing)).toEqual({ kind: "subscribe" });
    }
  });

  it("lets a member whose trial ended subscribe again", () => {
    expect(actionFor(plan("starter"), "monthly", OVERVIEWS.trialEnded)).toEqual({ kind: "subscribe" });
  });

  it("marks the live plan current and the others as upgrade or downgrade", () => {
    expect(actionFor(plan("pro"), "monthly", OVERVIEWS.active)).toEqual({ kind: "current" });
    expect(actionFor(plan("agency"), "monthly", OVERVIEWS.active)).toEqual({ kind: "upgrade" });
    expect(actionFor(plan("starter"), "monthly", OVERVIEWS.active)).toEqual({ kind: "downgrade" });
  });

  it("does not offer an in-place change across billing intervals", () => {
    expect(actionFor(plan("agency"), "yearly", OVERVIEWS.active).kind).toBe("unavailable");
  });

  it("does not offer a new subscription while a renewal is being retried", () => {
    expect(actionFor(plan("pro"), "monthly", OVERVIEWS.pastDue).kind).toBe("unavailable");
  });
});

describe("PlanGrid", () => {
  it("shows the three paid plans with monthly prices in rupees", () => {
    render(<PlanGrid catalogue={CATALOGUE} interval="monthly" overview={OVERVIEWS.trialing} />);
    expect(screen.getByRole("heading", { name: "Starter" })).toBeTruthy();
    expect(screen.getByText("₹799")).toBeTruthy();
    expect(screen.getByText("₹1,999")).toBeTruthy();
    expect(screen.getByText("₹5,999")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Free trial" })).toBeNull();
  });

  it("shows the monthly equivalent and the saving on yearly billing", () => {
    render(<PlanGrid catalogue={CATALOGUE} interval="yearly" overview={OVERVIEWS.trialing} />);
    // 799000 paise a year is 66,583 a month; the saving is two months of 79,900.
    expect(screen.getByText("₹666")).toBeTruthy();
    expect(screen.getByText(/Billed ₹7,990 a year\. You save ₹1,598\./)).toBeTruthy();
  });

  it("derives how many full creatives a plan covers from the catalogue", () => {
    render(<PlanGrid catalogue={CATALOGUE} interval="monthly" overview={OVERVIEWS.trialing} />);
    expect(screen.getByText(/80 AI credits a month \(about 13 full creatives\)/)).toBeTruthy();
    expect(screen.getByText(/650 AI credits a month \(about 108 full creatives\)/)).toBeTruthy();
  });

  it("calls onSelect with the plan and the action, and disables the current plan", () => {
    const onSelect = vi.fn();
    render(<PlanGrid catalogue={CATALOGUE} interval="monthly" overview={OVERVIEWS.active} onSelect={onSelect} />);

    const current = screen.getByRole("button", { name: "Your plan" }) as HTMLButtonElement;
    expect(current.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(onSelect).toHaveBeenCalledWith("agency", { kind: "upgrade" });
    fireEvent.click(screen.getByRole("button", { name: "Switch down" }));
    expect(onSelect).toHaveBeenCalledWith("starter", { kind: "downgrade" });
  });

  it("disables every purchase while payments are not configured", () => {
    render(<PlanGrid catalogue={CATALOGUE} interval="monthly" overview={OVERVIEWS.trialing} paymentsDisabled />);
    for (const button of screen.getAllByRole("button", { name: "Choose plan" })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("renders the public sign-up call to action through renderSignup", () => {
    render(
      <PlanGrid
        catalogue={CATALOGUE}
        interval="monthly"
        publicMode
        renderSignup={(className, label) => <a className={className} href="/register">{label}</a>}
      />,
    );
    const links = screen.getAllByRole("link", { name: "Start free trial" });
    expect(links).toHaveLength(3);
    expect(links[0]!.getAttribute("href")).toBe("/register");
  });
});

describe("IntervalToggle", () => {
  it("reports the chosen interval and can be locked", () => {
    const onChange = vi.fn();
    const { rerender } = render(<IntervalToggle value="monthly" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
    expect(onChange).toHaveBeenCalledWith("yearly");

    rerender(<IntervalToggle value="monthly" onChange={onChange} disabled />);
    expect((screen.getByRole("radio", { name: /Yearly/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("CurrentPlanPanel", () => {
  it("shows the balance and the monthly allowance left", () => {
    render(<CurrentPlanPanel overview={OVERVIEWS.active} />);
    expect(screen.getByText("168")).toBeTruthy();
    expect(screen.getByText(/143 of 200 monthly credits left/)).toBeTruthy();
    expect(screen.getByText(/25 bought credits/)).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("143");
    expect(bar.getAttribute("aria-valuemax")).toBe("200");
  });

  it("offers Cancel only on a live plan that is not already ending", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<CurrentPlanPanel overview={OVERVIEWS.active} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    expect(onCancel).toHaveBeenCalled();

    rerender(<CurrentPlanPanel overview={OVERVIEWS.cancelling} onCancel={onCancel} />);
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();

    rerender(<CurrentPlanPanel overview={OVERVIEWS.trialing} onCancel={onCancel} />);
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });

  it("explains each state in plain language", () => {
    expect(describeState(OVERVIEWS.trialing)).toMatch(/trial ends on .* \(\d+ days? left\)/);
    expect(describeState(OVERVIEWS.active)).toMatch(/^Renews on .*, billed monthly\.$/);
    expect(describeState(OVERVIEWS.cancelling)).toMatch(/^Ends on .*not be charged again/);
    expect(describeState(OVERVIEWS.pastDue)).toMatch(/retrying/);
    expect(describeState(OVERVIEWS.trialEnded)).toMatch(/trial has ended.*still here/);
  });

  it("has no allowance bar when the plan has no monthly credits", () => {
    render(<CurrentPlanPanel overview={OVERVIEWS.trialEnded} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("No monthly credits on this plan")).toBeTruthy();
  });
});

describe("CreditCosts and BillingHistory", () => {
  it("lists what each action costs, with free actions called free", () => {
    render(<CreditCosts costs={CATALOGUE.creditCosts} />);
    const full = screen.getByText("Full creative").closest("li")!;
    expect(within(full).getByText("6 credits")).toBeTruthy();
    const idea = screen.getByText("Creative ideas").closest("li")!;
    expect(within(idea).getByText("1 credit")).toBeTruthy();
    const reword = screen.getByText("Reword the text").closest("li")!;
    expect(within(reword).getByText("Free")).toBeTruthy();
  });

  it("shows payments and credit movements, with refunds and signs readable", () => {
    render(<BillingHistory history={HISTORY} />);
    expect(screen.getByText("Pro plan")).toBeTruthy();
    expect(screen.getByText("Credit pack")).toBeTruthy();
    expect(screen.getByText("Used: full creative")).toBeTruthy();
    expect(screen.getByText(/Refunded \(it did not complete\): full creative/)).toBeTruthy();
    expect(screen.getByText("+50")).toBeTruthy();
    expect(screen.getByText("-6")).toBeTruthy();
  });

  it("says so when there is no history yet", () => {
    render(<BillingHistory history={{ payments: [], credits: [] }} />);
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByText("No credit activity yet.")).toBeTruthy();
  });
});
