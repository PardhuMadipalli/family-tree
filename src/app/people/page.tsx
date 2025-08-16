"use client";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRelationsStore } from "@/lib/relationsStore";
import { usePeopleStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";
import { columns, type PeopleRow } from "./columns";
import { MultiSelect } from "@/components/multi-select";

type Gender = "male" | "female" | "other" | "unknown";

function CustomLabel({ label, htmlFor }: { label: string, htmlFor: string }) {
  return <Label htmlFor={htmlFor} className="text-xs text-black/70 dark:text-white/70" > {label}</Label >;
}

export default function PeoplePage() {
  const { people, isHydrated, hydrate, addPerson } = usePeopleStore();
  const { unions, parentChildLinks, isHydrated: relHydrated, hydrate: hydrateRelations, addUnion, addParentChildLink } = useRelationsStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (!relHydrated) void hydrateRelations();
  }, [relHydrated, hydrateRelations]);

  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const [notes, setNotes] = useState("");
  const [selectedSpouses, setSelectedSpouses] = useState<string[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [selectedParents, setSelectedParents] = useState<string[]>([]);

  const isValid = useMemo(() => givenName.trim().length > 0, [givenName]);

  // Create options for multi-select components
  const peopleOptions = useMemo(() =>
    people.map(p => ({
      label: `${p.givenName} ${p.familyName || ''}`.trim(),
      value: p.id
    })), [people]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    // Add the person first
    const personId = await addPerson({
      givenName: givenName.trim(),
      familyName: familyName.trim() || undefined,
      birthDate: birthDate || undefined,
      gender,
      notes: notes.trim() || undefined,
    });

    // Create unions (spouses)
    if (selectedSpouses.length > 0) {
      await addUnion([personId, ...selectedSpouses]);
    }

    // Create parent-child links for children
    if (selectedChildren.length > 0) {
      for (const childId of selectedChildren) {
        await addParentChildLink([personId], childId);
      }
    }

    // Create parent-child links for parents (single entry with all parents)
    if (selectedParents.length > 0) {
      await addParentChildLink(selectedParents, personId);
    }

    // Reset form
    setGivenName("");
    setFamilyName("");
    setBirthDate("");
    setGender("unknown");
    setNotes("");
    setSelectedSpouses([]);
    setSelectedChildren([]);
    setSelectedParents([]);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">People</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid md:grid-cols-5 grid-cols-1 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <CustomLabel label="Given name" htmlFor="givenName" />
            <Input
              id="givenName"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              placeholder="e.g., Ada"
              className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <CustomLabel label="Family name" htmlFor="familyName" />
            <Input
              id="familyName"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g., Lovelace"
              className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <CustomLabel label="Birth date" htmlFor="birthDate" />
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent justify-between w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <CustomLabel label="Gender" htmlFor="gender" />
            <Select
              value={gender}
              onValueChange={(value) => setGender(value as Gender)}
            >
              <SelectTrigger className="w-full" id="gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent id="gender-options">
                <SelectItem value="unknown">Unknown</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Relationship fields */}
        <div className="grid md:grid-cols-3 grid-cols-1 gap-4">
          <div className="flex flex-col gap-2">
            <CustomLabel label="Parents" htmlFor="parents" />
            <MultiSelect
              id="parents"
              options={peopleOptions}
              onValueChange={setSelectedParents}
              placeholder="Select parents"
              className="dark:bg-input/30"
              maxCount={2}
              searchable={true}
            />
          </div>
          <div className="flex flex-col gap-2">
            <CustomLabel label="Spouses" htmlFor="spouses" />
            <MultiSelect
              id="spouses"
              options={peopleOptions}
              onValueChange={setSelectedSpouses}
              placeholder="Select spouses"
              className="dark:bg-input/30"
              maxCount={3}
              searchable={true}
            />
          </div>
          <div className="flex flex-col gap-2">
            <CustomLabel label="Children" htmlFor="children" />
            <MultiSelect
              id="children"
              options={peopleOptions}
              onValueChange={setSelectedChildren}
              placeholder="Select children"
              className="dark:bg-input/30"
              maxCount={3}
              searchable={true}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <CustomLabel label="Notes" htmlFor="notes" />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="min-h-12 resize-none w-lg"
          />
        </div>

        <div className="flex justify-start">
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
        ) : (
          <DataTable<PeopleRow, unknown>
            columns={columns}
            data={people.map((p) => ({
              id: p.id,
              givenName: p.givenName,
              familyName: p.familyName,
              birthDate: p.birthDate,
              gender: p.gender,
              spouses: deriveSpouses(p.id, unions, people),
              parents: deriveParents(p.id, parentChildLinks, people),
              children: deriveChildren(p.id, parentChildLinks, people),
            }))}
          />
        )}
      </section>
    </div>
  );
}

function givenName(p?: { givenName: string }) {
  if (!p) return "";
  return p.givenName;
}

function deriveSpouses(personId: string, unions: { partnerIds: string[] }[], people: { id: string; givenName: string; familyName?: string }[]) {
  const set = new Set<string>();
  for (const u of unions) {
    if (u.partnerIds.includes(personId)) {
      for (const pid of u.partnerIds) if (pid !== personId) set.add(pid);
    }
  }
  return Array.from(set)
    .map((id) => givenName(people.find((p) => p.id === id)))
    .filter(Boolean)
    .join(", ");
}

function deriveParents(childId: string, links: { parentIds: string[]; childId: string }[], people: { id: string; givenName: string; familyName?: string }[]) {
  const link = links.find((l) => l.childId === childId);
  if (!link) return "";
  return link.parentIds.map((id) => givenName(people.find((p) => p.id === id))).filter(Boolean).join(" & ");
}

function deriveChildren(parentId: string, links: { parentIds: string[]; childId: string }[], people: { id: string; givenName: string; familyName?: string }[]) {
  const childrenIds = links.filter((l) => l.parentIds.includes(parentId)).map((l) => l.childId);
  return childrenIds.map((id) => people.find((p) => p.id === id)?.givenName).filter(Boolean).join(", ");
}



