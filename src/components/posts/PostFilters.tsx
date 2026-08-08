import { ArrowUpDown, CalendarRange, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATFORMS, SORT_OPTIONS } from "@/constants";
import { useBrands } from "@/hooks/useBrands";
import type { Platform, PostFilters as Filters, PostStatus, SortOption } from "@/types";

const STATUS_FILTERS: { value: PostStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "publishing", label: "Publishing" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];

interface PostFiltersProps {
  value: Filters;
  onChange: (value: Filters) => void;
}

export function PostFilters({ value, onChange }: PostFiltersProps) {
  const patch = (partial: Partial<Filters>) => onChange({ ...value, ...partial });
  const hasDateRange = Boolean(value.from || value.to);
  const { brands } = useBrands();

  // One select covers context and brand: "all" | "personal" | "brand:<id>".
  const contextValue =
    value.context === "brand" && value.brandId
      ? `brand:${value.brandId}`
      : value.context;

  const handleContextChange = (next: string) => {
    if (next.startsWith("brand:")) {
      patch({ context: "brand", brandId: next.slice("brand:".length) });
    } else {
      patch({ context: next as Filters["context"], brandId: null });
    }
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(e) => patch({ search: e.target.value })}
          placeholder="Search by title or caption…"
          className="pl-9"
          aria-label="Search posts"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={contextValue} onValueChange={handleContextChange}>
          <SelectTrigger className="w-36" aria-label="Filter by context">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contexts</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={`brand:${brand.id}`}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.status}
          onValueChange={(status) => patch({ status: status as PostStatus | "all" })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.platform}
          onValueChange={(platform) =>
            patch({ platform: platform as Platform | "all" })
          }
        >
          <SelectTrigger className="w-36" aria-label="Filter by platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((platform) => (
              <SelectItem key={platform.id} value={platform.id}>
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={hasDateRange ? "border-primary/60 bg-accent" : undefined}
            >
              <CalendarRange />
              {hasDateRange ? `${value.from || "…"} → ${value.to || "…"}` : "Dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="filter-from">From</Label>
              <Input
                id="filter-from"
                type="date"
                value={value.from}
                onChange={(e) => patch({ from: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-to">To</Label>
              <Input
                id="filter-to"
                type="date"
                value={value.to}
                onChange={(e) => patch({ to: e.target.value })}
              />
            </div>
            {hasDateRange && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => patch({ from: "", to: "" })}
              >
                <X />
                Clear dates
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Select
          value={value.sort}
          onValueChange={(sort) => patch({ sort: sort as SortOption })}
        >
          <SelectTrigger className="w-44" aria-label="Sort posts">
            <span className="flex items-center gap-2 truncate">
              <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
