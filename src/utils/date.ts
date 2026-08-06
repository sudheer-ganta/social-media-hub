import dayjs, { type Dayjs } from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isToday from "dayjs/plugin/isToday";
import isTomorrow from "dayjs/plugin/isTomorrow";

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);

export const DATE_FORMAT = "YYYY-MM-DD";
export const TIME_FORMAT = "HH:mm";

export function today(): string {
  return dayjs().format(DATE_FORMAT);
}

export function tomorrow(): string {
  return dayjs().add(1, "day").format(DATE_FORMAT);
}

export function nextMonday(): string {
  const now = dayjs();
  // dayjs: 0 = Sunday, 1 = Monday
  const daysUntilMonday = ((8 - now.day()) % 7) || 7;
  return now.add(daysUntilMonday, "day").format(DATE_FORMAT);
}

export function currentTime(): string {
  return dayjs().format(TIME_FORMAT);
}

export function formatDisplayDate(date: string): string {
  const d = dayjs(date);
  if (!d.isValid()) return date;
  if (d.isToday()) return "Today";
  if (d.isTomorrow()) return "Tomorrow";
  return d.format("MMM D, YYYY");
}

export function formatDisplayTime(time: string): string {
  const parsed = dayjs(`2000-01-01T${time}`);
  return parsed.isValid() ? parsed.format("h:mm A") : time;
}

export function formatRelative(dateTime: string): string {
  return dayjs(dateTime).fromNow();
}

export function publishDayjs(post: {
  publish_date: string;
  publish_time: string;
}): Dayjs {
  return dayjs(`${post.publish_date}T${post.publish_time || "00:00"}`);
}

export interface CalendarDay {
  date: Dayjs;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
}

/** Build a 6x7 grid of days for a month view, starting on Monday. */
export function buildMonthGrid(month: Dayjs): CalendarDay[] {
  const startOfMonth = month.startOf("month");
  // Convert Sunday-first index to Monday-first offset
  const offset = (startOfMonth.day() + 6) % 7;
  const gridStart = startOfMonth.subtract(offset, "day");

  return Array.from({ length: 42 }, (_, i) => {
    const date = gridStart.add(i, "day");
    return {
      date,
      iso: date.format(DATE_FORMAT),
      inMonth: date.month() === month.month(),
      isToday: date.isToday(),
    };
  });
}
