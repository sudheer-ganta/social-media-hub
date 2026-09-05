import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_BRAND_VOICE } from "@/ai/types";
import { brandsRepository } from "@/repositories/brands.repository";
import { brandVoicesService } from "@/services/brand-voices.service";
import { creationProfileRepository } from "@/repositories/creation-profile.repository";

export default function Onboarding() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"personal" | "brand" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("");
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      if (mode === "personal") {
        await creationProfileRepository.complete("personal");
        navigate("/posts/new?context=personal", { replace: true });
        return;
      }
      if (mode === "brand" && name.trim() && description.trim() && tone.trim()) {
        const brand = await brandsRepository.insert({ name: name.trim(), description: description.trim(), website: "" });
        await brandVoicesService.save(brand.id, brand.name, {
          ...DEFAULT_BRAND_VOICE, name: brand.name, description: description.trim(), tone: tone.trim(),
        });
        await creationProfileRepository.complete("brand", brand.id);
        navigate(`/posts/new?context=brand&brand=${brand.id}`, { replace: true });
      }
    } finally {
      setSaving(false);
    }
  }

  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
    <div><h1 className="text-2xl font-semibold">How will you create?</h1><p className="text-sm text-muted-foreground">You can switch contexts later.</p></div>
    <div className="grid grid-cols-2 gap-3">
      <Button variant={mode === "personal" ? "default" : "outline"} onClick={() => setMode("personal")}>Personal</Button>
      <Button variant={mode === "brand" ? "default" : "outline"} onClick={() => setMode("brand")}>Brand</Button>
    </div>
    {mode === "brand" && <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2"><Label htmlFor="onboarding-brand">Brand name</Label><Input id="onboarding-brand" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="onboarding-description">Brand profile</Label><Input id="onboarding-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your brand do?" /></div>
      <div className="space-y-2"><Label htmlFor="onboarding-tone">Brand voice</Label><Input id="onboarding-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. confident, warm, concise" /></div>
    </div>}
    <Button loading={saving} disabled={!mode || (mode === "brand" && (!name.trim() || !description.trim() || !tone.trim()))} onClick={finish}>Continue</Button>
  </main>;
}
