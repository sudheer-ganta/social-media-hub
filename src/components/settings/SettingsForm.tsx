import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup } from "@/components/settings/SettingsSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformSelector } from "@/components/posts/PlatformSelector";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useSettings } from "@/hooks/useSettings";
import { TIMEZONES } from "@/constants";
import { settingsSchema, type SettingsFormValues } from "@/validators";
import type { Platform } from "@/types";

const NOTIFICATION_OPTIONS: {
  key: "emailNotifications" | "pushNotifications" | "weeklyDigest";
  label: string;
  description: string;
}[] = [
  {
    key: "emailNotifications",
    label: "Email notifications",
    description: "Get notified when scheduled posts go live.",
  },
  {
    key: "pushNotifications",
    label: "Push notifications",
    description: "Real-time alerts in your browser.",
  },
  {
    key: "weeklyDigest",
    label: "Weekly digest",
    description: "A summary of performance every Monday.",
  },
];

export function SettingsForm() {
  const { settings, saveSettings } = useSettings();
  // Defaults apply to new posts, which start Personal until a context is chosen.
  const { integrations } = useIntegrations();
  const [saved, setSaved] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  const onSubmit = (values: SettingsFormValues) => {
    saveSettings(values);
    setSaved(true);
    toast.success("Settings saved");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsGroup
        title="Profile"
        description="How you appear across the workspace."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" placeholder="Alex Morgan" {...register("fullName")} />
            {errors.fullName && (
              <p className="text-xs font-medium text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="alex@company.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs font-medium text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" placeholder="Acme Inc." {...register("company")} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Timezone">
                    <SelectValue placeholder="Pick a timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Default platforms"
        description="Pre-selected whenever you create a new post."
      >
        <Controller
          control={control}
          name="defaultPlatforms"
          render={({ field }) => (
            <PlatformSelector
              value={field.value as Platform[]}
              onChange={field.onChange}
              integrations={integrations}
              contextLabel="Personal"
            />
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Notifications"
        description="Decide what lands in your inbox."
      >
        <ul className="divide-y border-y">
          {NOTIFICATION_OPTIONS.map((option) => (
            <li
              key={option.key}
              className="flex items-center justify-between gap-6 py-4"
            >
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
              <Controller
                control={control}
                name={option.key}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={option.label}
                  />
                )}
              />
            </li>
          ))}
        </ul>
      </SettingsGroup>

      <div className="sticky bottom-0 -mx-1 flex justify-end border-t bg-background/90 px-1 py-4 backdrop-blur-md">
        <Button type="submit" loading={isSubmitting} className="min-w-36">
          {saved ? (
            <>
              <Check />
              Saved
            </>
          ) : (
            <>
              <Save />
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
