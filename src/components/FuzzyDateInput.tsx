"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  composeFuzzyDate,
  daysInMonth,
  parseFuzzyDate,
  type FuzzyDate,
} from "@/lib/fuzzyDate";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// FuzzyDateInput — three-field control for partial-precision dates.
// ---------------------------------------------------------------------------
//
// Layout: [ Year | Month | Day ] in a 3-col grid that fits inside one column
// of the parent form (matches the width footprint of the prior <input
// type="date">). Year is required; Month is optional; Day is disabled until
// Month is picked. Day's max is computed from the chosen year+month so
// February in non-leap years caps at 28, etc.
//
// Value contract:
//   `value` is a canonical FuzzyDate string ("YYYY", "YYYY-MM", "YYYY-MM-DD")
//   or "" / undefined when empty. `onChange` ALWAYS emits a canonical form —
//   while the user is mid-typing the year (e.g. "19"), we keep that text in
//   local state and emit "" until they reach 4 digits. This guarantees the
//   parent never holds a malformed value that could leak into the store.
//
// Cascading rules:
//   - clearing Year clears everything (emits "")
//   - clearing Month clears Day (emits just "YYYY")
//   - changing Month to one with fewer days clears Day if out of range

const MONTHS = [
  { value: "1", label: "Jan" },
  { value: "2", label: "Feb" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Apr" },
  { value: "5", label: "May" },
  { value: "6", label: "Jun" },
  { value: "7", label: "Jul" },
  { value: "8", label: "Aug" },
  { value: "9", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

export interface FuzzyDateInputProps {
  id?: string;
  value: FuzzyDate | undefined;
  onChange: (next: FuzzyDate) => void;
  className?: string;
  disabled?: boolean;
  /** Optional aria-label fallback when there is no visible label nearby. */
  ariaLabel?: string;
}

export function FuzzyDateInput({
  id,
  value,
  onChange,
  className,
  disabled,
  ariaLabel,
}: FuzzyDateInputProps) {
  const reactId = useId();
  const baseId = id ?? `fuzzy-date-${reactId}`;

  const parsed = parseFuzzyDate(value);
  const canonicalYearStr = parsed ? String(parsed.year) : "";
  const monthStr = parsed?.month !== undefined ? String(parsed.month) : "";
  const dayStr = parsed?.day !== undefined ? String(parsed.day) : "";

  // Year text lives in local state so we can render mid-typing partial input
  // (e.g. "19") without pushing an invalid FuzzyDate up to the parent. We
  // sync FROM props whenever the canonical year changes externally
  // (controlled-component pattern: parent drives the source of truth).
  const [yearText, setYearText] = useState(canonicalYearStr);
  useEffect(() => {
    setYearText(canonicalYearStr);
  }, [canonicalYearStr]);

  const yearNum = parsed?.year;
  const monthNum = parsed?.month;

  const dayMax = useMemo(() => {
    if (yearNum === undefined || monthNum === undefined) return 31;
    return daysInMonth(yearNum, monthNum);
  }, [yearNum, monthNum]);

  const monthDisabled = disabled || yearNum === undefined;
  const dayDisabled = disabled || monthNum === undefined;

  function emit(y: string, m: string, d: string) {
    onChange(composeFuzzyDate(y, m, d));
  }

  function onYearChange(raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 4);
    setYearText(cleaned);
    if (cleaned === "") {
      // Clearing year clears everything.
      onChange("");
      return;
    }
    if (cleaned.length === 4) {
      emit(cleaned, monthStr, dayStr);
    } else {
      // In-progress year: parent value resets to empty so it never holds an
      // invalid FuzzyDate. The local yearText keeps the input populated.
      onChange("");
    }
  }

  function onMonthChange(next: string) {
    if (!next) {
      emit(canonicalYearStr, "", "");
      return;
    }
    const m = Number(next);
    // Clear day if it now exceeds the new month's day count.
    let nextDay = dayStr;
    if (yearNum !== undefined && dayStr !== "") {
      const max = daysInMonth(yearNum, m);
      if (Number(dayStr) > max) nextDay = "";
    }
    emit(canonicalYearStr, next, nextDay);
  }

  function onDayChange(raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 2);
    if (cleaned === "") {
      emit(canonicalYearStr, monthStr, "");
      return;
    }
    const n = Number(cleaned);
    if (n < 1 || n > dayMax) {
      // Out of range: don't update parent. The previous valid value re-renders.
      return;
    }
    emit(canonicalYearStr, monthStr, cleaned);
  }

  return (
    <div
      className={cn("grid grid-cols-[1fr_1fr_1fr] gap-1.5", className)}
      role="group"
      aria-label={ariaLabel}
    >
      <Input
        id={baseId}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        placeholder="Year"
        value={yearText}
        onChange={(e) => onYearChange(e.target.value)}
        disabled={disabled}
        aria-label="Year"
        className="text-sm"
      />
      <Select
        value={monthStr || undefined}
        onValueChange={onMonthChange}
        disabled={monthDisabled}
      >
        <SelectTrigger
          id={`${baseId}-month`}
          aria-label="Month"
          className="w-full text-sm"
        >
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={`${baseId}-day`}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        maxLength={2}
        placeholder="Day"
        value={dayStr}
        onChange={(e) => onDayChange(e.target.value)}
        disabled={dayDisabled}
        aria-label="Day"
        className="text-sm"
      />
    </div>
  );
}
