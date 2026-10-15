const LOCALE = undefined; // the viewer's locale

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const longDate = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

export const formatInteger = (value: number | null | undefined): string =>
  value == null ? "—" : integer.format(value);

export const formatDecimal = (value: number | null | undefined): string =>
  value == null ? "—" : decimal.format(value);

/** 1,284 / 12.9K / 4.2M — for stat tiles and axis ticks. */
export const formatCompact = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value);
};

export const formatPercent = (value: number | null | undefined): string =>
  value == null ? "—" : `${percent.format(value)}%`;

/** API dates are ISO calendar dates (YYYY-MM-DD); format them in UTC so they never shift a day. */
const toDate = (value: string): Date => new Date(`${value.slice(0, 10)}T00:00:00Z`);

export const formatDate = (value: string | null | undefined): string =>
  value ? longDate.format(toDate(value)) : "—";

export const formatShortDate = (value: string | null | undefined): string =>
  value ? shortDate.format(toDate(value)) : "—";

export const formatMonth = (value: string): string => monthYear.format(toDate(value));

export const formatDateTime = (value: string | null | undefined): string =>
  value ? dateTime.format(new Date(value)) : "—";

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimal.format(bytes / 1024)} KB`;
  return `${decimal.format(bytes / (1024 * 1024))} MB`;
};

export const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${decimal.format(seconds)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

export const formatRelative = (value: string | null | undefined, now: number = Date.now()): string => {
  if (!value) return "never";
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};
