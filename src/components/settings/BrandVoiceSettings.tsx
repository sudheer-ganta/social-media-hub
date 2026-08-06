import { useState } from "react";
import { Plus, Star, Trash2, Edit2, Check, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandVoicePanel } from "@/components/marketing/BrandVoicePanel";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import type { BrandVoice, BrandVoiceProfile } from "@/types";
import { DEFAULT_BRAND_VOICE } from "@/ai/types";

export function BrandVoiceSettings() {
  const { profiles, isLoading, createProfile, updateProfile, setDefault, deleteProfile } =
    useBrandVoices();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeVoice, setActiveVoice] = useState<BrandVoice>(DEFAULT_BRAND_VOICE);
  const [activeName, setActiveName] = useState("");

  const handleEdit = (id: string, name: string, voice: BrandVoice) => {
    setEditingId(id);
    setActiveName(name);
    setActiveVoice(voice);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setEditingId(null);
    setActiveName("New Brand Voice");
    setActiveVoice(DEFAULT_BRAND_VOICE);
    setIsCreating(true);
  };

  const handleSave = async () => {
    const profileName = (activeVoice.name || activeName || "Brand Voice").trim();
    if (editingId) {
      await updateProfile({ id: editingId, name: profileName, voice: { ...activeVoice, name: profileName } });
      setEditingId(null);
    } else {
      await createProfile({ name: profileName, voice: { ...activeVoice, name: profileName } });
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Brand Voice Profiles
            </CardTitle>
            <CardDescription>
              Configure default brand personality profiles. All AI generations automatically inherit your Default profile.
            </CardDescription>
          </div>
          {!isCreating && !editingId && (
            <Button size="sm" onClick={handleStartCreate} className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Brand Voice
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Saved Profiles List */}
          {!isCreating && !editingId && (
            <div>
              {isLoading ? (
                <p className="text-xs text-muted-foreground py-4">Loading profiles...</p>
              ) : profiles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm font-medium">No Brand Voice profiles created yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Create your first Brand Voice profile to set your tone, vocabulary, and brand rules across all AI content.
                  </p>
                  <Button size="sm" onClick={handleStartCreate} className="text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Create First Profile
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profiles.map((p: BrandVoiceProfile) => (
                    <div
                      key={p.id}
                      className="rounded-xl border bg-card p-4 space-y-3 flex flex-col justify-between transition-all hover:border-primary/40"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          {p.is_default ? (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] gap-1 shrink-0">
                              <Star className="h-3 w-3 fill-current" /> Default
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => setDefault(p.id)}
                            >
                              Make Default
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
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
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {p.voice.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleEdit(p.id, p.name, p.voice)}
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => deleteProfile(p.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Editor */}
          {(isCreating || editingId) && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
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
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave}>
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
        </CardContent>
      </Card>
    </div>
  );
}
