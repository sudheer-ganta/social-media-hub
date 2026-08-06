export * from "./post";

export type Theme = "light" | "dark" | "system";

export interface UserSettings {
  fullName: string;
  email: string;
  company: string;
  timezone: string;
  defaultPlatforms: string[];
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyDigest: boolean;
}
