"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PersonV1 } from "@/lib/domain";
import { compareFuzzyDates, formatFuzzyDate, fuzzyAge } from "@/lib/fuzzyDate";
import { usePeopleStore } from "@/lib/store";
import { ColumnDef } from "@tanstack/react-table";
import { Baby, CalendarClock, CircleHelp, Cross, Eye, Mars, Pencil, Trash, UsersRound, Venus } from "lucide-react";
import { useEffect, useState } from "react";
import { FuzzyDateInput } from "@/components/FuzzyDateInput";

type Gender = "male" | "female" | "other" | "unknown";

export type PeopleRow = Pick<PersonV1, "id" | "givenName" | "familyName" | "birthDate" | "deathDate" | "gender"> & {
  spouses?: string;
  parents?: string;
  children?: string;
};

function deriveAge(birthDate?: string, deathDate?: string) {
  // FuzzyDate-aware age computation. Handles year-only inputs by falling
  // back to a simple year diff; handles full dates with the usual
  // "has-had-birthday-this-year" adjustment.
  return fuzzyAge(birthDate, deathDate);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-black/70 dark:text-white/70">{label}</span>
      {children}
    </label>
  );
}

function ViewPersonDialog({ person }: { person: PeopleRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-fit sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person.givenName} {person.familyName ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
          {person.gender === "male" ? (
            <Mars className="size-4 text-[var(--male)]" />
          ) : person.gender === "female" ? (
            <Venus className="size-4 text-[var(--female)]" />
          ) : (
            <CircleHelp className="size-4" />
          )}
          <span className="capitalize">{person.gender ?? "unknown"}</span>
          {person.birthDate ? (
            <span className="inline-flex items-center gap-1 ml-3">
              <CalendarClock className="size-4" />
              <span>b. {formatFuzzyDate(person.birthDate)}</span>
            </span>
          ) : null}
          {person.deathDate ? (
            <span className="inline-flex items-center gap-1 ml-3">
              <Cross className="size-4" />
              <span>d. {formatFuzzyDate(person.deathDate)}</span>
            </span>
          ) : null}
          {(() => {
            const age = deriveAge(person.birthDate, person.deathDate);
            if (age === undefined) return null;
            return (
              <span className="ml-3 text-xs">
                {person.deathDate ? `aged ${age}` : `${age} years old`}
              </span>
            );
          })()}
        </div>
        {person.spouses ? (
          <div className="flex items-start gap-2">
            <UsersRound className="size-4 mt-0.5" />
            <div className="truncate">
              <span className="text-muted-foreground">Spouse(s): </span>
              <span>{person.spouses}</span>
            </div>
          </div>
        ) : null}
        {person.parents ? (
          <div className="flex items-start gap-2">
            <UsersRound className="size-4 mt-0.5" />
            <div className="truncate">
              <span className="text-muted-foreground">Parents: </span>
              <span>{person.parents}</span>
            </div>
          </div>
        ) : null}
        {person.children ? (
          <div className="flex items-start gap-2">
            <Baby className="size-4 mt-0.5" />
            <div className="truncate">
              <span className="text-muted-foreground">Children: </span>
              <span>{person.children}</span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPersonDialog({ person }: { person: PeopleRow }) {
  const { updatePerson } = usePeopleStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    givenName: person.givenName ?? "",
    familyName: person.familyName ?? "",
    birthDate: person.birthDate ?? "",
    deathDate: person.deathDate ?? "",
    gender: (person.gender ?? "unknown") as Gender,
    notes: "",
  });

  useEffect(() => {
    setDraft({
      givenName: person.givenName ?? "",
      familyName: person.familyName ?? "",
      birthDate: person.birthDate ?? "",
      deathDate: person.deathDate ?? "",
      gender: (person.gender ?? "unknown") as Gender,
      notes: "",
    });
  }, [person.id, person.givenName, person.familyName, person.birthDate, person.deathDate, person.gender]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit person</DialogTitle>
        </DialogHeader>
        <div className="mt-2 grid gap-3">
          <Field label="Given name">
            <Input
              value={draft.givenName}
              onChange={(e) => setDraft((d) => ({ ...d, givenName: e.target.value }))}
              className="h-9 w-full rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
            />
          </Field>
          <Field label="Family name">
            <Input
              value={draft.familyName}
              onChange={(e) => setDraft((d) => ({ ...d, familyName: e.target.value }))}
              className="h-9 w-full rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Birth date">
              <FuzzyDateInput
                value={draft.birthDate}
                onChange={(v) => setDraft((d) => ({ ...d, birthDate: v }))}
                ariaLabel="Birth date"
              />
            </Field>
            <Field label="Death date">
              <FuzzyDateInput
                value={draft.deathDate}
                onChange={(v) => setDraft((d) => ({ ...d, deathDate: v }))}
                ariaLabel="Death date"
              />
            </Field>
          </div>
          {(() => {
            const cmp = compareFuzzyDates(draft.birthDate, draft.deathDate);
            if (cmp !== undefined && cmp > 0) {
              return (
                <p className="text-xs text-destructive -mt-1">
                  Death date is before birth date.
                </p>
              );
            }
            return null;
          })()}
          {(() => {
            const age = deriveAge(draft.birthDate, draft.deathDate);
            if (age === undefined) return null;
            return (
              <p className="text-xs text-muted-foreground -mt-1">
                {draft.deathDate ? `Lived ${age} years.` : `${age} years old.`}
              </p>
            );
          })()}
          <Field label="Gender">
            <Select
              value={draft.gender}
              onValueChange={(value) => setDraft((d) => ({ ...d, gender: value as Gender }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unknown</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="min-h-15"
            />
          </Field>
        </div>
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              onClick={async () => {
                await updatePerson(person.id, {
                  givenName: draft.givenName.trim() || person.givenName,
                  familyName: draft.familyName.trim() || undefined,
                  birthDate: draft.birthDate || undefined,
                  deathDate: draft.deathDate || undefined,
                  gender: draft.gender,
                  notes: draft.notes.trim() || undefined,
                });
              }}
              variant="default"
            >
              Save
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePersonButton({ person }: { person: PeopleRow }) {
  const { deletePerson } = usePeopleStore();
  return (
    <Button
      onClick={async () => {
        const ok = window.confirm("Delete this person? This cannot be undone.");
        if (ok) await deletePerson(person.id);
      }}
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      aria-label="Delete person"
    >
      <Trash className="size-4" />
    </Button>
  );
}

export const columns: ColumnDef<PeopleRow>[] = [
  {
    accessorKey: "gender",
    header: "",
    cell: ({ row }) => {
      const g = row.getValue<string>("gender");
      if (g === "male") {
        return (
          <span className="inline-flex items-center justify-center size-7 rounded-full bg-[var(--male)]/15">
            <Mars className="size-4 text-[var(--male)]" aria-label="male" />
          </span>
        );
      }
      if (g === "female") {
        return (
          <span className="inline-flex items-center justify-center size-7 rounded-full bg-[var(--female)]/15">
            <Venus className="size-4 text-[var(--female)]" aria-label="female" />
          </span>
        );
      }
      return (
        <span className="inline-flex items-center justify-center size-7 rounded-full bg-muted">
          <CircleHelp className="size-4 text-muted-foreground" aria-label="unknown" />
        </span>
      );
    },
    size: 40,
    enableResizing: false,
  },
  {
    accessorKey: "givenName",
    header: "Given name",
    cell: ({ row }) => <span className="font-medium">{row.getValue("givenName")}</span>,
  },
  {
    accessorKey: "familyName",
    header: "Family name",
    cell: ({ row }) => {
      const v = row.getValue<string | undefined>("familyName");
      return v ? <span>{v}</span> : <span className="text-muted-foreground/60">—</span>;
    },
  },
  {
    accessorKey: "birthDate",
    header: "Birth date",
    cell: ({ row }) => {
      const v = row.getValue<string>("birthDate");
      return v ? (
        <span className="tabular-nums">{formatFuzzyDate(v)}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      );
    },
  },
  {
    accessorKey: "deathDate",
    header: "Death date",
    cell: ({ row }) => {
      const v = row.getValue<string>("deathDate");
      return v ? (
        <span className="tabular-nums">{formatFuzzyDate(v)}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      );
    },
  },
  {
    accessorKey: "spouses",
    header: "Spouse(s)",
    cell: ({ row }) => {
      const v = row.getValue<string | undefined>("spouses");
      if (!v) return <span className="text-muted-foreground/60">—</span>;
      const names = v.split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <div className="flex flex-wrap gap-1">
          {names.map((n, i) => (
            <span
              key={`${n}-${i}`}
              className="inline-flex items-center rounded-md bg-brand/10 text-brand text-xs px-2 py-0.5 font-medium"
            >
              {n}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const person = row.original;
      return (
        <div className="flex items-center gap-1">
          <ViewPersonDialog person={person} />
          <EditPersonDialog person={person} />
          <DeletePersonButton person={person} />
        </div>
      );
    },
    size: 120,
    enableResizing: false,
  },
];


