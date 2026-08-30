// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import CreatePost from "./CreatePost";
import { usePost } from "@/hooks/usePosts";
import { useBrands } from "@/hooks/useBrands";
import { PERSONAL_CONTEXT, brandContext } from "@/constants/integrations";
import { CreatePostForm } from "@/components/posts/CreatePostForm";

afterEach(() => {
  cleanup();
});

// Mock react-router-dom functions
const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockParams: Record<string, string> = {};
const mockSetSearchParams = vi.fn((params) => {
  mockSearchParams = new URLSearchParams(params);
});

vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => mockParams),
  useSearchParams: vi.fn(() => [mockSearchParams, mockSetSearchParams]),
  useNavigate: vi.fn(() => mockNavigate),
}));

// Mock the query hooks
vi.mock("@/hooks/usePosts", () => ({
  usePost: vi.fn(),
}));

vi.mock("@/hooks/useBrands", () => ({
  useBrands: vi.fn(),
}));

// Mock the child form to isolate context switcher page-level tests
vi.mock("@/components/posts/CreatePostForm", () => ({
  CreatePostForm: vi.fn(({ onDirtyChange, saveDraftRef, context }: any) => {
    return (
      <div data-testid="mock-form">
        <span data-testid="form-context">{JSON.stringify(context)}</span>
        <button data-testid="dirty-btn" onClick={() => onDirtyChange?.(true)}>
          Set Dirty
        </button>
        <button data-testid="clean-btn" onClick={() => onDirtyChange?.(false)}>
          Set Clean
        </button>
        <button
          data-testid="save-btn"
          onClick={() => {
            if (saveDraftRef?.current) {
              saveDraftRef.current();
            }
          }}
        >
          Trigger Save
        </button>
      </div>
    );
  }),
}));

const DropdownContext = React.createContext<{ isOpen: boolean; setIsOpen: (val: boolean) => void } | null>(null);

// Mock Radix UI React primitive libraries directly to ensure portable inline rendering in JSDOM tests
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: ({ children, open, onOpenChange }: any) => {
    const [isOpenState, setIsOpenState] = React.useState(open ?? false);
    React.useEffect(() => {
      if (open !== undefined) setIsOpenState(open);
    }, [open]);

    const toggle = (val: boolean) => {
      setIsOpenState(val);
      onOpenChange?.(val);
    };

    return (
      <DropdownContext.Provider value={{ isOpen: isOpenState, setIsOpen: toggle }}>
        <div data-testid="dropdown-root" data-open={isOpenState}>
          {children}
        </div>
      </DropdownContext.Provider>
    );
  },
  Trigger: React.forwardRef(({ children, asChild, ...props }: any, ref: any) => {
    const ctx = React.useContext(DropdownContext);
    const handleClick = (e: any) => {
      ctx?.setIsOpen(!ctx.isOpen);
      if (children?.props?.onClick) children.props.onClick(e);
    };
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as any, { ref, onClick: handleClick, ...props });
    }
    return <button ref={ref} onClick={handleClick} {...props}>{children}</button>;
  }),
  Content: React.forwardRef(({ children, ...props }: any, ref: any) => {
    const ctx = React.useContext(DropdownContext);
    if (!ctx?.isOpen) return null;
    return (
      <div ref={ref} data-testid="dropdown-content" {...props}>
        {children}
      </div>
    );
  }),
  Item: React.forwardRef(({ children, onClick, ...props }: any, ref: any) => {
    const ctx = React.useContext(DropdownContext);
    const handleClick = (e: any) => {
      onClick?.(e);
      ctx?.setIsOpen(false);
    };
    return (
      <button ref={ref} type="button" onClick={handleClick} {...props}>{children}</button>
    );
  }),
  Separator: () => <hr />,
  Portal: ({ children }: any) => <>{children}</>,
  Group: ({ children }: any) => <div>{children}</div>,
  Arrow: () => null,
  Sub: ({ children }: any) => <div>{children}</div>,
  SubTrigger: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>{children}</button>
  )),
  SubContent: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} {...props}>{children}</div>
  )),
  RadioGroup: ({ children }: any) => <div>{children}</div>,
  RadioItem: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>{children}</button>
  )),
  CheckboxItem: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>{children}</button>
  )),
  ItemIndicator: ({ children }: any) => <span>{children}</span>,
  Label: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} {...props}>{children}</div>
  )),
}));

vi.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children, open }: any) => open ? <div>{children}</div> : null,
  Trigger: ({ children }: any) => children,
  Content: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} data-testid="dialog-content" {...props}>{children}</div>
  )),
  Title: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <h2 ref={ref} {...props}>{children}</h2>
  )),
  Description: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <p ref={ref} {...props}>{children}</p>
  )),
  Close: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>{children}</button>
  )),
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} {...props}>{children}</div>
  )),
}));

describe("CreatePost Page Context Switching", () => {
  const mockBrands = [
    { id: "brand-1", name: "Brand One", description: "", website: "" },
    { id: "brand-2", name: "Brand Two", description: "", website: "" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSearchParams = new URLSearchParams();
    mockParams = {};
    mockNavigate.mockReset();
    mockSetSearchParams.mockClear();

    // Default mocks
    vi.mocked(useBrands).mockReturnValue({
      brands: mockBrands,
      isLoading: false,
      createBrand: vi.fn(),
      updateBrand: vi.fn(),
      deleteBrand: vi.fn(),
      isCreating: false,
    } as any);

    vi.mocked(usePost).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    // Reset CreatePostForm mock implementation to default
    vi.mocked(CreatePostForm).mockImplementation(({ onDirtyChange, saveDraftRef, context }: any) => {
      return (
        <div data-testid="mock-form">
          <span data-testid="form-context">{JSON.stringify(context)}</span>
          <button data-testid="dirty-btn" onClick={() => onDirtyChange?.(true)}>
            Set Dirty
          </button>
          <button data-testid="clean-btn" onClick={() => onDirtyChange?.(false)}>
            Set Clean
          </button>
          <button
            data-testid="save-btn"
            onClick={() => {
              if (saveDraftRef?.current) {
                saveDraftRef.current();
              }
            }}
          >
            Trigger Save
          </button>
        </div>
      );
    });
  });

  it("defaults to Personal context if URL and localStorage are empty", () => {
    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(PERSONAL_CONTEXT);
  });

  it("uses Personal context if explicitly set in URL context query param", () => {
    mockSearchParams.set("context", "personal");
    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(PERSONAL_CONTEXT);
  });

  it("uses correct Brand context if explicitly set in URL brand query param", () => {
    mockSearchParams.set("context", "brand");
    mockSearchParams.set("brand", "brand-1");
    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(brandContext("brand-1"));
  });

  it("restores the last-used Brand context from localStorage when no URL context is present", () => {
    localStorage.setItem("flowpost_last_context", JSON.stringify(brandContext("brand-2")));
    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(brandContext("brand-2"));
  });

  it("falls back to Personal context if the stored brand ID no longer exists", () => {
    localStorage.setItem("flowpost_last_context", JSON.stringify(brandContext("non-existent-brand")));
    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(PERSONAL_CONTEXT);
  });

  it("switches context immediately if the form is clean", () => {
    render(<CreatePost />);
    
    // Open context switcher
    const trigger = screen.getByRole("button", { name: /Personal/ });
    fireEvent.click(trigger);

    // Click Brand One item
    const brandItem = screen.getByText("Brand One");
    fireEvent.click(brandItem);

    // Verify it called setSearchParams immediately
    expect(mockSetSearchParams).toHaveBeenCalledWith(
      { context: "brand", brand: "brand-1" },
      { replace: true }
    );
  });

  it("shows confirmation dialog if the form is dirty when switching", () => {
    render(<CreatePost />);
    
    // Make form dirty
    const dirtyBtn = screen.getByTestId("dirty-btn");
    fireEvent.click(dirtyBtn);

    // Clear sync calls on mount
    mockSetSearchParams.mockClear();

    // Attempt switch context
    const trigger = screen.getByRole("button", { name: /Personal/ });
    fireEvent.click(trigger);
    const brandItem = screen.getByText("Brand One");
    fireEvent.click(brandItem);

    // Dialog should open and not call setSearchParams yet
    expect(screen.getByText("Switch context?")).toBeDefined();
    expect(mockSetSearchParams).not.toHaveBeenCalled();
  });

  it("saves draft and performs context switch when user confirms Save & Switch", async () => {
    const mockSave = vi.fn().mockResolvedValue({ id: "post-123" });
    
    // Custom mock form implementation to inject saveDraftRef simulation
    vi.mocked(CreatePostForm).mockImplementation(({ onDirtyChange, saveDraftRef }: any) => {
      React.useEffect(() => {
        if (saveDraftRef) {
          saveDraftRef.current = mockSave;
        }
      }, [saveDraftRef]);
      return (
        <div data-testid="mock-form">
          <button data-testid="dirty-btn" onClick={() => onDirtyChange?.(true)}>Set Dirty</button>
        </div>
      );
    });

    render(<CreatePost />);
    
    // Make dirty
    fireEvent.click(screen.getByTestId("dirty-btn"));

    // Switch context
    fireEvent.click(screen.getByRole("button", { name: /Personal/ }));
    fireEvent.click(screen.getByText("Brand One"));

    // Click Save & Switch in confirmation dialog
    const saveAndSwitchBtn = screen.getByRole("button", { name: /Save & Switch/ });
    fireEvent.click(saveAndSwitchBtn);

    // Verify save mutation was called
    expect(mockSave).toHaveBeenCalled();

    // Verify it switches context after saving
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalledWith(
        { context: "brand", brand: "brand-1" },
        { replace: true }
      );
    });
  });

  it("disables context switcher during edit mode", () => {
    mockParams = { id: "post-123" };
    vi.mocked(usePost).mockReturnValue({
      data: { id: "post-123", context_type: "brand", brand_id: "brand-1" },
      isLoading: false,
    } as any);
    
    render(<CreatePost />);
    
    // Switcher should be disabled
    const trigger = screen.getByRole("button", { name: /Brand One/ });
    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  it("still opens in Personal context if the user has no brands", () => {
    vi.mocked(useBrands).mockReturnValue({
      brands: [],
      isLoading: false,
      createBrand: vi.fn(),
      isCreating: false,
    } as any);

    render(<CreatePost />);
    const contextEl = screen.getByTestId("form-context");
    expect(JSON.parse(contextEl.textContent || "")).toEqual(PERSONAL_CONTEXT);
  });
});
