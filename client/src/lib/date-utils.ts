/**
 * Format duration in seconds to a human-readable string (e.g., "5m 30s")
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "-";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format a date string to a localized date string
 */
export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Format a date string to a full localized date and time string
 */
export function formatDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Format a date string to date and time (short format)
 */
export function formatDateTimeShort(dateString: string | Date | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
