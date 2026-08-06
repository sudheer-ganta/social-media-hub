import { useState } from "react";
import { ChevronDown, Plus, Save, Trash2, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BrandPersonality, BrandVoice, CtaStyle, EmojiStyle } from "@/ai/types";

const PERSONALITIES: BrandPersonality[] = [
  "Luxury", "Corporate", "Playful", "Minimal", "Friendly",
  "Bold", "Professional", "Premium", "Technical",
];

const PERSONALITY_COLORS: Record<BrandPersonality, string> = {
  Luxury:       "bg-amber-500/10 text-amber-600 border-amber-500/30",
  Corporate:    "bg-slate-500/10 text-slate-600 border-slate-500/30",
  Playful:      "bg-pink-500/10 text-pink-600 border-pink-500/30",
  Minimal:      "bg-zinc-500/10 text-zinc-600 border-zinc-500/30",
  Friendly:     "bg-green-500/10 text-green-600 border-green-500/30",
  Bold:         "bg-red-500/10 text-red-600 border-red-500/30",
  Professional: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  Premium:      "bg-violet-500/10 text-violet-600 border-violet-500/30",
  Technical:    "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
};

interface BrandVoicePanelProps {
  voice: BrandVoice;
  onChange: (voice: BrandVoice) => void;
  profileNames: string[];
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1 text-xs cursor-pointer"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              {tag}
              <span className="text-muted-foreground hover:text-foreground">×</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandVoicePanel({
  voice,
  onChange,
  profileNames,
  onSave,
  onLoad,
  onDelete,
}: BrandVoicePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [saveProfileName, setSaveProfileName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const set = <K extends keyof BrandVoice>(key: K, val: BrandVoice[K]) =>
    onChange({ ...voice, [key]: val });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Brand Voice</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reusable personality applied to every generated asset.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "Collapse" : "Edit"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Profile Selector Dropdown */}
      {profileNames.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Select Brand Profile
          </Label>
          {(() => {
            const matchedName = profileNames.find(
              (n) => n.toLowerCase() === (voice.name || "").toLowerCase()
            ) ?? profileNames[0] ?? "";

            return (
              <Select
                value={matchedName}
                onValueChange={(selectedName) => onLoad(selectedName)}
              >
                <SelectTrigger className="h-8 text-xs font-medium bg-card">
                  <SelectValue>{matchedName || "Choose a brand profile..."}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {profileNames.map((name) => (
                    <SelectItem key={name} value={name} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && voice.name && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant="outline" className="text-xs font-medium">{voice.name}</Badge>
          <Badge className={cn("text-xs border", PERSONALITY_COLORS[voice.personality])}>
            {voice.personality}
          </Badge>
          <Badge variant="secondary" className="text-xs">{voice.tone}</Badge>
          <Badge variant="secondary" className="text-xs">{voice.emojiStyle} emoji</Badge>
        </div>
      )}
      {!expanded && !voice.name && (
        <p className="text-xs text-muted-foreground italic">
          No brand voice configured — click Edit to set one.
        </p>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">
              {/* Saved profiles */}
              {profileNames.length > 0 && (
                <div className="rounded-lg border border-dashed p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Saved Profiles
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profileNames.map((name) => (
                      <div key={name} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onLoad(name)}
                          className={cn(
                            "rounded-l-md border px-2 py-1 text-xs transition-colors",
                            voice.name === name
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card hover:bg-accent border-border"
                          )}
                        >
                          <Upload className="inline h-2.5 w-2.5 mr-1" />
                          {name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(name)}
                          className="rounded-r-md border border-l-0 border-border bg-card px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Core fields */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Brand Name</Label>
                  <Input
                    value={voice.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Acme Studio"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Audience</Label>
                  <Input
                    value={voice.targetAudience}
                    onChange={(e) => set("targetAudience", e.target.value)}
                    placeholder="Design-conscious millennials"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Brand Description</Label>
                <Textarea
                  value={voice.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="A minimal luxury brand for creative professionals..."
                  className="text-xs min-h-[60px] resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Mission</Label>
                <Input
                  value={voice.mission}
                  onChange={(e) => set("mission", e.target.value)}
                  placeholder="Helping creators build brands that last"
                  className="h-8 text-xs"
                />
              </div>

              {/* Style controls */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tone</Label>
                  <Input
                    value={voice.tone}
                    onChange={(e) => set("tone", e.target.value)}
                    placeholder="e.g. Warm, Authoritative"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Emoji Style</Label>
                  <Select
                    value={voice.emojiStyle}
                    onValueChange={(v) => set("emojiStyle", v as EmojiStyle)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["None", "Light", "Moderate", "Heavy"] as EmojiStyle[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CTA Style</Label>
                  <Select
                    value={voice.ctaStyle}
                    onValueChange={(v) => set("ctaStyle", v as CtaStyle)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["Soft", "Hard", "Luxury", "Professional", "Urgency", "Minimal"] as CtaStyle[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Personality */}
              <div className="space-y-2">
                <Label className="text-xs">Brand Personality</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PERSONALITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("personality", p)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                        voice.personality === p
                          ? PERSONALITY_COLORS[p]
                          : "border-border bg-card hover:bg-accent text-muted-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Words */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ Words to Always Use
                  </Label>
                  <TagInput
                    value={voice.wordsToUse}
                    onChange={(tags) => set("wordsToUse", tags)}
                    placeholder="exclusive, curated…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-rose-500">
                    ✗ Words to Avoid
                  </Label>
                  <TagInput
                    value={voice.wordsToAvoid}
                    onChange={(tags) => set("wordsToAvoid", tags)}
                    placeholder="cheap, deal…"
                  />
                </div>
              </div>

              {/* Save profile */}
              <div className="flex items-center gap-2 pt-1 border-t">
                {showSaveInput ? (
                  <>
                    <Input
                      autoFocus
                      value={saveProfileName}
                      onChange={(e) => setSaveProfileName(e.target.value)}
                      placeholder="Profile name…"
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onSave(saveProfileName);
                          setSaveProfileName("");
                          setShowSaveInput(false);
                        }
                        if (e.key === "Escape") setShowSaveInput(false);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        onSave(saveProfileName);
                        setSaveProfileName("");
                        setShowSaveInput(false);
                      }}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShowSaveInput(true)}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save as Profile
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
