import { z } from "zod";

export const settingsSchema = z.object({
  fullName: z.string().min(2, "Enter your name."),
  email: z.string().email("Enter a valid email address.").or(z.literal("")),
  company: z.string(),
  timezone: z.string().min(1, "Pick a timezone."),
  defaultPlatforms: z.array(z.string()),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  weeklyDigest: z.boolean(),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;
