"use client";

import { useEffect, useMemo, useState } from "react";
import { usePeopleStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Gender = "male" | "female" | "other" | "unknown";

export default function PeoplePage() {
  const { people, isHydrated, hydrate, addPerson } = usePeopleStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const [notes, setNotes] = useState("");

  const isValid = useMemo(() => givenName.trim().length > 0, [givenName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    await addPerson({
      givenName: givenName.trim(),
      familyName: familyName.trim() || undefined,
      birthDate: birthDate || undefined,
      gender,
      notes: notes.trim() || undefined,
    });
    setGivenName("");
    setFamilyName("");
    setBirthDate("");
    setGender("unknown");
    setNotes("");
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">People</h2>
      <form onSubmit={onSubmit} className="grid md:grid-cols-5 grid-cols-1 gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/70 dark:text-white/70">Given name</label>
          <Input
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            placeholder="e.g., Ada"
            className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/70 dark:text-white/70">Family name</label>
          <Input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g., Lovelace"
            className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/70 dark:text-white/70">Birth date</label>
          <Input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/70 dark:text-white/70">Gender</label>
          <Select
            value={gender}
            onValueChange={(value) => setGender(value as Gender)}
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
        </div>
        <div className="flex flex-col gap-1 md:col-span-5">
          <label className="text-xs text-black/70 dark:text-white/70">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="min-h-15"
          />
        </div>
        <div className="md:col-span-5">
          <Button
            type="submit"
            disabled={!isValid}
            variant="default"
          >
            Add person
          </Button>
        </div>
      </form>

      <section className="space-y-2">
        <h3 className="font-medium">All people</h3>
        {isHydrated && people.length === 0 ? (
          <p className="text-sm text-black/70 dark:text-white/70">No people yet. Add the first person above.</p>
        ) : null}
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {people.map((p) => (
            <PersonListItem key={p.id} personId={p.id} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PersonListItem({ personId }: { personId: string }) {
  const { people, updatePerson, deletePerson } = usePeopleStore();
  const person = people.find((x) => x.id === personId);
  const [open, setOpen] = useState(false);

  // local draft state
  const [draft, setDraft] = useState({
    givenName: person?.givenName ?? "",
    familyName: person?.familyName ?? "",
    birthDate: person?.birthDate ?? "",
    gender: (person?.gender ?? "unknown") as Gender,
    notes: person?.notes ?? "",
  });

  useEffect(() => {
    if (person) {
      setDraft({
        givenName: person.givenName ?? "",
        familyName: person.familyName ?? "",
        birthDate: person.birthDate ?? "",
        gender: (person.gender ?? "unknown") as Gender,
        notes: person.notes ?? "",
      });
    }
  }, [person?.id]);

  if (!person) return null;

  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <div className="grow">
        <div className="font-medium">
          {person.givenName} {person.familyName ?? ""}
        </div>
        <div className="text-xs text-black/60 dark:text-white/60">
          {person.birthDate ? `b. ${person.birthDate}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
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
        <Button
          onClick={async () => {
            const ok = window.confirm("Delete this person? This cannot be undone.");
            if (ok) await deletePerson(person.id);
          }}
          variant="destructive"
        >
          Delete
        </Button>
      </div>
    </li >
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-black/70 dark:text-white/70">{label}</span>
      {children}
    </label>
  );
}

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



