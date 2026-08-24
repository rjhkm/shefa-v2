const numberFormatters = new Map<string, Intl.NumberFormat>();

export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number, maximumFractionDigits = 2, minimumFractionDigits = maximumFractionDigits) {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits, maximumFractionDigits });
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatInteger(value: number) {
  return formatNumber(value, 0, 0);
}

export function formatDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "UTC",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("day")} ${part("month")} '${part("year")}, ${part("hour")}:${part("minute")}:${part("second")} ${part("dayPeriod")}`;
}

export function formatDateRange(start: string, end: string) {
  const days = Math.max(0, (Date.parse(end) - Date.parse(start)) / 86_400_000);
  const dayLabel = Number.isInteger(days) ? formatInteger(days) : formatNumber(days, 1, 1);
  return `${formatDateTime(start)} – ${formatDateTime(end)} · ${dayLabel} days`;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US");
}
