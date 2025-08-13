"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { PersonV1 } from "@/lib/domain";
import { Mars, Venus, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { usePeopleStore } from "@/lib/store";

type Gender = "male" | "female" | "other" | "unknown";

export type PeopleRow = Pick<PersonV1, "id" | "givenName" | "familyName" | "birthDate" | "gender">;

function deriveAge(birthDate?: string) {
  if (!birthDate) return undefined;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-black/70 dark:text-white/70">{label}</span>
      {children}
    </label>
  );
}

function EditPersonDialog({ person }: { person: PeopleRow }) {
  const { updatePerson } = usePeopleStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    givenName: person.givenName ?? "",
    familyName: person.familyName ?? "",
    birthDate: person.birthDate ?? "",
    gender: (person.gender ?? "unknown") as Gender,
    notes: "",
  });

  useEffect(() => {
    setDraft({
      givenName: person.givenName ?? "",
      familyName: person.familyName ?? "",
      birthDate: person.birthDate ?? "",
      gender: (person.gender ?? "unknown") as Gender,
      notes: "",
    });
  }, [person.id, person.givenName, person.familyName, person.birthDate, person.gender]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
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
              <Input
                type="date"
                value={draft.birthDate}
                onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))}
                className="h-9 w-full rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
              />
            </Field>
            <Field label="Age (years)">
              <Input
                type="number"
                min={0}
                disabled
                value={deriveAge(draft.birthDate) ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n) || n <= 0) return;
                  const year = new Date().getFullYear() - Math.floor(n);
                  setDraft((d) => ({ ...d, birthDate: `${year}-01-01` }));
                }}
              />
            </Field>
          </div>
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
      variant="destructive"
      size="sm"
    >
      Delete
    </Button>
  );
}

export const columns: ColumnDef<PeopleRow>[] = [
  {
    accessorKey: "gender",
    header: "",
    cell: ({ row }) => {
      const g = row.getValue<string>("gender");
      if (g === "male") return <Mars className="size-4 text-blue-600" aria-label="male" />;
      if (g === "female") return <Venus className="size-4 text-pink-600" aria-label="female" />;
      return <CircleHelp className="size-4 text-muted-foreground" aria-label="unknown" />;
    },
    size: 32,
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
  },
  {
    accessorKey: "birthDate",
    header: "Birth date",
    cell: ({ row }) => {
      const v = row.getValue<string>("birthDate");
      return v ? new Date(v).toLocaleDateString() : "";
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const person = row.original;
      return (
        <div className="flex items-center gap-2">
          <EditPersonDialog person={person} />
          <DeletePersonButton person={person} />
        </div>
      );
    },
    size: 120,
    enableResizing: false,
  },
];


