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
  return new Date(value).toLocaleString("en-US");
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US");
}
