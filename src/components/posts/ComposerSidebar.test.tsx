// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { ComposerStateContext } from "./ComposerStateContext";
import { ComposerSidebar } from "./ComposerSidebar";
import type { ComposerState } from "./ComposerStateContext";

// Mock dependent sub-components to prevent testing children layout details
vi.mock("./PlatformPreview", () => ({
  PlatformPreview: () => <div data-testid="mock-preview">PlatformPreview</div>,
}));

vi.mock("./ReachPanel", () => ({
  ReachPanel: ({ mode }: any) => <div data-testid="mock-reach" data-mode={mode}>ReachPanel</div>,
}));

vi.mock("./AdvancedInsights", () => ({
  AdvancedInsights: ({ post }: any) => (
    <div data-testid="mock-advanced-insights">
      AdvancedInsights
      {post ? (
        <span data-testid="advanced-post-id">{post.id}</span>
      ) : (
        <span data-testid="advanced-no-post">No Post</span>
      )}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("ComposerSidebar Consolidated Analysis Tab", () => {
  let mockState: Partial<ComposerState>;

  beforeEach(() => {
    mockState = {
      activeSidebarTab: "preview",
      setActiveSidebarTab: vi.fn(),
      media: [],
      selectedMedia: 0,
      setSelectedMedia: vi.fn(),
      authorName: "Test Author",
      integrations: [],
      mediaCapabilities: {},
      isBrand: false,
      isPublished: false,
      aiResult: null,
      reachSuggestedTime: null,
      post: undefined,
    };
  });

  const renderSidebar = (stateValues: Partial<ComposerState> = {}, defaultFormValues: any = {}) => {
    const combinedState = { ...mockState, ...stateValues } as ComposerState;

    const FormWrapper = ({ children }: { children: React.ReactNode }) => {
      const methods = useForm({ defaultValues: defaultFormValues });
      return <FormProvider {...methods}>{children}</FormProvider>;
    };

    return render(
      <ComposerStateContext.Provider value={combinedState}>
        <FormWrapper>
          <ComposerSidebar />
        </FormWrapper>
      </ComposerStateContext.Provider>
    );
  };

  it("renders Preview tab content by default", () => {
    renderSidebar();
    expect(screen.getByTestId("mock-preview")).toBeDefined();
    expect(screen.queryByTestId("mock-reach")).toBeNull();
  });

  it("renders ReachPanel inside the Analysis tab under Personal context", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isBrand: false,
    });

    const reachEl = screen.getByTestId("mock-reach");
    expect(reachEl).toBeDefined();
    expect(reachEl.getAttribute("data-mode")).toBe("personal");
    expect(screen.queryByTestId("mock-advanced-insights")).toBeNull();
  });

  it("renders ReachPanel inside the Analysis tab under Brand context", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isBrand: true,
    });

    const reachEl = screen.getByTestId("mock-reach");
    expect(reachEl).toBeDefined();
    expect(reachEl.getAttribute("data-mode")).toBe("brand");
    expect(screen.getByTestId("mock-advanced-insights")).toBeDefined();
  });

  it("renders AdvancedInsights with post data when Brand post is saved", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isBrand: true,
      post: { id: "post-123", status: "draft" } as any,
    });

    expect(screen.getByTestId("mock-advanced-insights")).toBeDefined();
    expect(screen.getByTestId("advanced-post-id").textContent).toBe("post-123");
  });

  it("renders AdvancedInsights placeholder notice when Brand post is completely new (unsaved)", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isBrand: true,
      post: undefined,
    });

    expect(screen.getByTestId("mock-advanced-insights")).toBeDefined();
    expect(screen.getByTestId("advanced-no-post")).toBeDefined();
  });

  it("gracefully omits AdvancedInsights for Personal posts under Analysis tab", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isBrand: false,
    });

    expect(screen.queryByTestId("mock-advanced-insights")).toBeNull();
  });

  it("renders published context disabled message if post is already published", () => {
    renderSidebar({
      activeSidebarTab: "analysis",
      isPublished: true,
    });

    expect(screen.queryByTestId("mock-reach")).toBeNull();
    expect(screen.getByText(/Post is already published/i)).toBeDefined();
  });
});
