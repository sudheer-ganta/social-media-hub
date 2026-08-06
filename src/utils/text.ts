const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function estimateReadingTime(text: string): string {
  const words = countWords(text);
  if (words === 0) return "0 sec";
  const seconds = Math.ceil((words / WORDS_PER_MINUTE) * 60);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
