import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Star, Trash2, Edit2, Check, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { BrandVoicePanel } from "@/components/marketing/BrandVoicePanel";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { useBrands } from "@/hooks/useBrands";
import type { BrandVoice, BrandVoiceProfile } from "@/types";
import { DEFAULT_BRAND_VOICE } from "@/ai/types";

export function BrandVoiceSettings() {
  const [searchParams] = useSearchParams();
  const brandIdParam = searchParams.get("brandId");

  const { profiles, isLoading, createProfile, updateProfile, setDefault, deleteProfile } =
    useBrandVoices();
  const { brands } = useBrands();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeVoice, setActiveVoice] = useState<BrandVoice>(DEFAULT_BRAND_VOICE);
  const [activeName, setActiveName] = useState("");
  const [activeBrandId, setActiveBrandId] = useState("");

  useEffect(() => {
    if (brandIdParam && !isLoading && !isCreating && !editingId) {
      const existing = profiles.find((p) => p.brand_id === brandIdParam);
      if (existing) {
        handleEdit(existing.id, existing.name, existing.voice, existing.brand_id);
      } else {
        const targetBrand = brands.find((b) => b.id === brandIdParam);
        if (targetBrand) {
          setEditingId(null);
          setActiveName(`${targetBrand.name} Voice`);
          setActiveVoice({
            ...DEFAULT_BRAND_VOICE,
            name: `${targetBrand.name} Voice`,
            description: targetBrand.description || "",
          });
          setActiveBrandId(targetBrand.id);
          setIsCreating(true);
        }
      }
    }
  }, [brandIdParam, isLoading, profiles, brands]);

  const handleEdit = (id: string, name: string, voice: BrandVoice, brandId: string | null) => {
    setEditingId(id);
    setActiveName(name);
    setActiveVoice(voice);
    setActiveBrandId(brandId ?? "");
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setEditingId(null);
    setActiveName("New Brand Voice");
    setActiveVoice(DEFAULT_BRAND_VOICE);
    setActiveBrandId(brands[0]?.id ?? "");
    setIsCreating(true);
  };

  const handleSave = async () => {
    const profileName = (activeVoice.name || activeName || "Brand Voice").trim();
    if (!activeBrandId) return;
    if (editingId) {
      await updateProfile({ id: editingId, brandId: activeBrandId, name: profileName, voice: { ...activeVoice, name: profileName } });
      setEditingId(null);
    } else {
      await createProfile({ brandId: activeBrandId, name: profileName, voice: { ...activeVoice, name: profileName } });
      setIsCreating(false);
    }
  };

  return (
    <SettingsSection
      title="Brand Voice Profiles"
      description="Personality profiles for each brand. Every AI generation inherits your Default profile."
      actions={
        !isCreating && !editingId ? (
          <Button size="sm" onClick={handleStartCreate} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Brand Voice
          </Button>
        ) : undefined
      }
    >
      {/* Saved Profiles List */}
      {!isCreating && !editingId && (
        <div>
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading profiles...</p>
          ) : profiles.length === 0 ? (
            <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No Brand Voice profiles yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Create a profile to set tone, vocabulary and brand rules across all AI content.
              </p>
              <Button size="sm" onClick={handleStartCreate} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Create First Profile
              </Button>
            </div>
          ) : (
            <ul className="divide-y border-y">
              {profiles.map((p: BrandVoiceProfile) => (
                <li key={p.id} className="flex items-start gap-4 py-5">
                  {p.voice.logoUrl ? (
                    <img
                      src={p.voice.logoUrl}
                      alt={`${p.name} logo`}
                      className="h-10 w-10 shrink-0 rounded-lg border bg-secondary/80 object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-muted-foreground/60">
                      <Building2 className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      {p.is_default && (
                        <Badge className="gap-1 border-primary/20 bg-primary/10 text-[10px] text-primary">
                          <Star className="h-3 w-3 fill-current" /> Default
                        </Badge>
                      )}
                      {p.voice.personality && (
                        <Badge variant="secondary" className="text-[10px]">
                          {p.voice.personality}
                        </Badge>
                      )}
                      {p.voice.tone && (
                        <Badge variant="outline" className="text-[10px]">
                          {p.voice.tone}
                        </Badge>
                      )}
                    </div>
                    {p.voice.description && (
                      <p className="line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                        {p.voice.description}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!p.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setDefault(p.id)}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(p.id, p.name, p.voice, p.brand_id)}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteProfile(p.id)}
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

          {/* Active Editor */}
          {(isCreating || editingId) && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="brand-voice-brand" className="text-sm font-medium">Brand</label>
                <select id="brand-voice-brand" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={activeBrandId} onChange={(e) => setActiveBrandId(e.target.value)}>
                  <option value="">Choose a brand</option>
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <p className="text-sm font-semibold">
                  {editingId ? `Editing Profile: ${activeName}` : "Create Brand Voice Profile"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1" disabled={!activeBrandId} onClick={handleSave}>
                    <Check className="h-3.5 w-3.5" />
                    Save Profile
                  </Button>
                </div>
              </div>

              <BrandVoicePanel
                voice={activeVoice}
                onChange={setActiveVoice}
                profileNames={[]}
                onSave={() => {}}
                onLoad={() => {}}
                onDelete={() => {}}
              />
            </div>
          )}
    </SettingsSection>
  );
}
