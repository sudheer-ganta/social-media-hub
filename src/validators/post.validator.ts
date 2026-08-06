import dayjs from "dayjs";
import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export const postSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .min(3, "Give your post a title of at least 3 characters.")
    .max(120, "Keep the title under 120 characters."),
  caption: z.string().trim().min(1, "Caption is required."),
  image_url: z.string().min(1, "Add an image before saving."),
  platforms: z
    .array(z.enum(["linkedin", "instagram", "facebook", "x", "threads"]))
    .min(1, "Select at least one platform."),
  publish_date: z
    .string()
    .regex(DATE_PATTERN, "Pick a valid publish date.")
    .refine((value) => dayjs(value).isValid(), "Pick a valid publish date."),
  publish_time: z
    .string()
    .regex(TIME_PATTERN, "Pick a valid publish time."),
  timezone: z.string().min(1, "Pick a timezone."),
});

export type PostFormValues = z.infer<typeof postSchema>;

/** Scheduling requires the publish moment to be in the future. */
export function validateFutureSchedule(values: {
  publish_date: string;
  publish_time: string;
}): string | null {
  const moment = dayjs(`${values.publish_date}T${values.publish_time}`);
  if (!moment.isValid()) return "Pick a valid date and time.";
  if (moment.isBefore(dayjs())) {
    return "Scheduled posts need a date and time in the future.";
  }
  return null;
}
