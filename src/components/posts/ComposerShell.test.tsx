// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { ComposerStateContext } from "./ComposerStateContext";
import { ComposerShell } from "./ComposerShell";
import type { ComposerState } from "./ComposerStateContext";

// Mock the child components to focus on shell routing, tabs, and layout structure
vi.mock("./ComposerEditor", () => ({
  ComposerEditor: () => <div data-testid="mock-editor">ComposerEditor</div>,
}));

vi.mock("./ComposerSidebar", () => ({
  ComposerSidebar: () => <div data-testid="mock-sidebar">ComposerSidebar</div>,
}));

vi.mock("./ComposerActionBar", () => ({
  ComposerActionBar: () => <div data-testid="mock-action-bar">ComposerActionBar</div>,
}));

vi.mock("./PublishedSummary", () => ({
  PublishedSummary: () => <div data-testid="mock-summary">PublishedSummary</div>,
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

afterEach(() => {
  cleanup();
});

describe("ComposerShell layout and responsive switcher", () => {
  let mockState: Partial<ComposerState>;

  beforeEach(() => {
    mockState = {
      published: null,
      media: [],
      form: { getValues: vi.fn(() => ({})) } as any,
      retryProvider: vi.fn(),
      publish: { isPending: false } as any,
      publishingProvider: null,
      editing: false,
      context: { contextType: "personal", brandId: null },
      brand: null,
      activeMobileTab: "edit",
      setActiveMobileTab: vi.fn(),
    };
  });

  const renderShell = (stateValues: Partial<ComposerState> = {}) => {
    const combinedState = { ...mockState, ...stateValues } as ComposerState;
    
    // Wrapper component to provide react-hook-form context
    const FormWrapper = ({ children }: { children: React.ReactNode }) => {
      const methods = useForm({ defaultValues: {} });
      return <FormProvider {...methods}>{children}</FormProvider>;
    };

    return render(
      <ComposerStateContext.Provider value={combinedState}>
        <FormWrapper>
          <ComposerShell />
        </FormWrapper>
      </ComposerStateContext.Provider>
    );
  };

  it("renders the primary workspace layout (editor, sidebar, and action bar) in standard composition", () => {
    renderShell();
    
    expect(screen.getByTestId("mock-editor")).toBeDefined();
    expect(screen.getByTestId("mock-sidebar")).toBeDefined();
    expect(screen.getByTestId("mock-action-bar")).toBeDefined();
    expect(screen.queryByTestId("mock-summary")).toBeNull();
  });

  it("displays the mobile switcher tabs on smaller viewports", () => {
    renderShell();
    
    const editTab = screen.getByRole("button", { name: "Edit" });
    const previewTab = screen.getByRole("button", { name: "Preview" });
    
    expect(editTab).toBeDefined();
    expect(previewTab).toBeDefined();
  });

  it("triggers setActiveMobileTab when clicking on mobile toggle buttons", () => {
    const setActiveMobileTabSpy = vi.fn();
    renderShell({ setActiveMobileTab: setActiveMobileTabSpy });
    
    const previewTab = screen.getByRole("button", { name: "Preview" });
    fireEvent.click(previewTab);
    
    expect(setActiveMobileTabSpy).toHaveBeenCalledWith("preview");
  });

  it("renders PublishedSummary when published status context is present", () => {
    renderShell({
      published: {
        id: "post-123",
        platforms: [{ provider: "instagram", providerName: "Instagram", status: "PUBLISHED", publishedId: "ig-123", url: "https://ig.com", errorMessage: null, notice: null }],
      },
    });
    
    expect(screen.getByTestId("mock-summary")).toBeDefined();
    expect(screen.queryByTestId("mock-editor")).toBeNull();
    expect(screen.queryByTestId("mock-sidebar")).toBeNull();
  });
});
