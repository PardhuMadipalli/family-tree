// ---------------------------------------------------------------------------
// FuzzyDate — partial ISO 8601 date strings used everywhere in the app.
// ---------------------------------------------------------------------------
//
// Accepted shapes:
//   "YYYY"          year only          e.g. "1985"
//   "YYYY-MM"       month + year       e.g. "1985-03"
//   "YYYY-MM-DD"    full date          e.g. "1985-03-15"
//
// Why a single string (not an object): the three forms are valid ISO 8601
// prefixes, sort chronologically as plain strings, and existing data already
// stored as `YYYY-MM-DD` remains valid without any migration. Adding a new
// date field anywhere in the app is just `field?: FuzzyDate` plus dropping
// `<FuzzyDateInput>` into the form.

export type FuzzyDate = string;

export type DatePrecision = 'year' | 'month' | 'day';

export interface ParsedFuzzyDate {
  year: number;
  month?: number; // 1..12
  day?: number;   // 1..daysInMonth(year, month)
  precision: DatePrecision;
}

const RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Days in a given month, accounting for leap years. */
export function daysInMonth(year: number, month: number): number {
  // Date(year, month, 0) returns the last day of the previous month, so passing
  // `month` (1..12) yields the day count for that month directly.
  return new Date(year, month, 0).getDate();
}

/**
 * Parse a FuzzyDate string. Returns `undefined` if the input is empty,
 * malformed, or out-of-range (invalid month, day past end-of-month, etc.).
 *
 * This is the single source of truth for what counts as a valid FuzzyDate;
 * UI, import validation, and comparison helpers all build on it.
 */
export function parseFuzzyDate(s: string | undefined | null): ParsedFuzzyDate | undefined {
  if (!s) return undefined;
  const m = RE.exec(s);
  if (!m) return undefined;

  const year = Number(m[1]);
  if (!Number.isInteger(year) || year < 1 || year > 9999) return undefined;

  if (m[2] === undefined) {
    return { year, precision: 'year' };
  }

  const month = Number(m[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined;

  if (m[3] === undefined) {
    return { year, month, precision: 'month' };
  }

  const day = Number(m[3]);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return undefined;

  return { year, month, day, precision: 'day' };
}

/** Build a FuzzyDate string from parts. Returns `''` if year is missing. */
export function composeFuzzyDate(
  year: number | string | undefined,
  month?: number | string,
  day?: number | string,
): FuzzyDate {
  const y = year === undefined || year === '' ? undefined : Number(year);
  const m = month === undefined || month === '' ? undefined : Number(month);
  const d = day === undefined || day === '' ? undefined : Number(day);
  if (y === undefined || !Number.isFinite(y)) return '';
  const yStr = String(Math.trunc(y)).padStart(4, '0');
  if (m === undefined || !Number.isFinite(m)) return yStr;
  const mStr = String(Math.trunc(m)).padStart(2, '0');
  if (d === undefined || !Number.isFinite(d)) return `${yStr}-${mStr}`;
  const dStr = String(Math.trunc(d)).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/** True if the string is a syntactically and numerically valid FuzzyDate. */
export function isValidFuzzyDate(s: string | undefined | null): boolean {
  return parseFuzzyDate(s) !== undefined;
}

/**
 * Format a FuzzyDate for display. Precision-aware:
 *   year   -> "1985"
 *   month  -> "Mar 1985" (locale-dependent)
 *   day    -> "3/15/1985" (locale-dependent)
 *
 * Returns `''` for empty / invalid input so callers can safely interpolate.
 */
export function formatFuzzyDate(s: FuzzyDate | undefined | null, locale?: string): string {
  const p = parseFuzzyDate(s);
  if (!p) return '';
  if (p.precision === 'year') return String(p.year);
  if (p.precision === 'month') {
    return new Date(p.year, p.month! - 1, 1).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
    });
  }
  return new Date(p.year, p.month! - 1, p.day!).toLocaleDateString(locale);
}

/**
 * Compare two FuzzyDates chronologically using only the precision both share.
 *
 * Examples:
 *   compareFuzzyDates("1985",       "1985-06-15") === 0   // can't tell, treat as equal
 *   compareFuzzyDates("1985-03",    "1985-03-15") === 0   // both agree on month
 *   compareFuzzyDates("1985-03-14", "1985-03-15") < 0
 *   compareFuzzyDates("1985",       "1986")        < 0
 *
 * Returns `undefined` if either side is invalid.
 */
export function compareFuzzyDates(
  a: FuzzyDate | undefined | null,
  b: FuzzyDate | undefined | null,
): number | undefined {
  const pa = parseFuzzyDate(a);
  const pb = parseFuzzyDate(b);
  if (!pa || !pb) return undefined;

  if (pa.year !== pb.year) return pa.year - pb.year;

  // Only compare month if BOTH have month precision (or finer).
  if (pa.month !== undefined && pb.month !== undefined) {
    if (pa.month !== pb.month) return pa.month - pb.month;
    if (pa.day !== undefined && pb.day !== undefined) {
      return pa.day - pb.day;
    }
  }
  return 0;
}

/**
 * Compute age in years given a birth FuzzyDate and an optional reference
 * FuzzyDate (defaults to today). Returns `undefined` if birth is missing
 * or invalid.
 *
 * Precision behavior:
 *   - If birth or reference has only year precision, the result is the
 *     simple year difference (`ref.year - birth.year`).
 *   - If both have month-or-finer precision, the function checks whether
 *     the birthday has occurred in the reference year and subtracts 1 if
 *     not (matching the previous full-date `deriveAge` logic).
 */
export function fuzzyAge(birth?: FuzzyDate | null, ref?: FuzzyDate | null): number | undefined {
  const pb = parseFuzzyDate(birth);
  if (!pb) return undefined;

  let pr: ParsedFuzzyDate | undefined;
  if (ref) {
    pr = parseFuzzyDate(ref);
    if (!pr) return undefined;
  } else {
    const now = new Date();
    pr = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      precision: 'day',
    };
  }

  let age = pr.year - pb.year;

  // Only adjust for "hasn't had birthday yet this year" when both sides
  // have at least month precision; otherwise we don't have enough info.
  if (pb.month !== undefined && pr.month !== undefined) {
    const birthMonth = pb.month;
    const refMonth = pr.month;
    if (refMonth < birthMonth) {
      age -= 1;
    } else if (refMonth === birthMonth) {
      if (pb.day !== undefined && pr.day !== undefined && pr.day < pb.day) {
        age -= 1;
      }
    }
  }

  return age;
}
