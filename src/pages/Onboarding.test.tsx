/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  complete: vi.fn(),
  insertBrand: vi.fn(),
  saveVoice: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/repositories/creation-profile.repository", () => ({
  creationProfileRepository: { complete: mocks.complete },
}));
vi.mock("@/repositories/brands.repository", () => ({
  brandsRepository: { insert: mocks.insertBrand },
}));
vi.mock("@/services/brand-voices.service", () => ({
  brandVoicesService: { save: mocks.saveVoice },
}));

describe("Phase 2 onboarding", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.complete.mockResolvedValue(undefined);
    mocks.insertBrand.mockResolvedValue({ id: "brand-a", name: "Brand A" });
    mocks.saveVoice.mockResolvedValue({ id: "voice-a" });
  });

  it("persists Personal before entering creation", async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith("personal"));
    expect(mocks.insertBrand).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/posts/new?context=personal", { replace: true });
  });

  it("requires and persists Brand profile plus its linked voice before entering creation", async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Brand" }));
    fireEvent.change(screen.getByLabelText("Brand name"), { target: { value: "Brand A" } });
    fireEvent.change(screen.getByLabelText("Brand profile"), { target: { value: "Premium coffee" } });
    fireEvent.change(screen.getByLabelText("Brand voice"), { target: { value: "Warm and concise" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mocks.insertBrand).toHaveBeenCalledWith({
      name: "Brand A", description: "Premium coffee", website: "",
    }));
    expect(mocks.saveVoice).toHaveBeenCalledWith(
      "brand-a", "Brand A", expect.objectContaining({ tone: "Warm and concise" }),
    );
    expect(mocks.complete).toHaveBeenCalledWith("brand", "brand-a");
    expect(mocks.navigate).toHaveBeenCalledWith("/posts/new?context=brand&brand=brand-a", { replace: true });
  });
});
