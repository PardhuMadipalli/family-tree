"use client";

import { useEffect, useMemo, useState } from 'react';
import { usePeopleStore } from '@/lib/store';
import { useRelationsStore } from '@/lib/relationsStore';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Trash, Heart, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function RelationsPage() {
  const { people, isHydrated: isPeopleHydrated, hydrate: hydratePeople } = usePeopleStore();
  const {
    unions,
    parentChildLinks,
    isHydrated: isRelationsHydrated,
    hydrate: hydrateRelations,
    addUnion,
    addParentChildLink,
    deleteUnion,
    deleteParentChildLink,
  } = useRelationsStore();

  useEffect(() => {
    if (!isPeopleHydrated) void hydratePeople();
  }, [isPeopleHydrated, hydratePeople]);

  useEffect(() => {
    if (!isRelationsHydrated) void hydrateRelations();
  }, [isRelationsHydrated, hydrateRelations]);

  // Union form state
  const [partnerA, setPartnerA] = useState('');
  const [partnerB, setPartnerB] = useState('');
  const canCreateUnion = useMemo(
    () => partnerA && partnerB && partnerA !== partnerB,
    [partnerA, partnerB]
  );

  // Parent-child form state
  const [parent1, setParent1] = useState('');
  const [parent2, setParent2] = useState('');
  const [child, setChild] = useState('');
  const canCreatePC = useMemo(
    () => child && (parent1 || parent2) && (!parent1 || parent1 !== child) && (!parent2 || parent2 !== child) && (parent1 !== parent2),
    [child, parent1, parent2]
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Relationships</h2>
        <p className="text-sm text-muted-foreground">
          Connect partners with unions, and link parents to their children.
        </p>
      </header>

      <section className="rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <Heart className="size-4 text-brand" />
            <h3 className="text-sm font-medium">Create union (partners)</h3>
          </div>
          {unions.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-brand/10 text-brand text-xs px-2 py-0.5 font-medium">
              {unions.length} {unions.length === 1 ? 'union' : 'unions'}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <SelectPerson value={partnerA} onChange={setPartnerA} label="Partner A" people={people} />
            <SelectPerson value={partnerB} onChange={setPartnerB} label="Partner B" people={people} />
            <Button
              disabled={!canCreateUnion}
              onClick={async () => {
                await addUnion([partnerA, partnerB]);
                setPartnerA('');
                setPartnerB('');
              }}
              variant="default"
            >
              Create union
            </Button>
          </div>
          {unions.length > 0 && (
            <div className="space-y-1.5 max-w-2xl pt-1">
              {unions.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm hover:bg-muted/40 transition">
                  <div className="flex items-center gap-2">
                    <Heart className="size-3.5 text-brand/70" />
                    <span>
                      {u.partnerIds.map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown').join(' + ')}
                    </span>
                  </div>
                  <DeleteUnionDialog union={u} people={people} onDelete={deleteUnion} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="size-4 text-brand" />
            <h3 className="text-sm font-medium">Create parent → child link</h3>
          </div>
          {parentChildLinks.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-brand/10 text-brand text-xs px-2 py-0.5 font-medium">
              {parentChildLinks.length} {parentChildLinks.length === 1 ? 'link' : 'links'}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <SelectPerson value={parent1} onChange={setParent1} label="Parent 1" people={people} />
            <SelectPerson value={parent2} onChange={setParent2} label="Parent 2 (optional)" people={people} />
            <SelectPerson value={child} onChange={setChild} label="Child" people={people} />
            <Button
              disabled={!canCreatePC}
              onClick={async () => {
                const parents = [parent1, parent2].filter(Boolean);
                await addParentChildLink(parents as string[], child);
                setParent1('');
                setParent2('');
                setChild('');
              }}
              variant="default"
            >
              Link parents → child
            </Button>
          </div>
          {parentChildLinks.length > 0 && (
            <div className="space-y-1.5 max-w-2xl pt-1">
              {parentChildLinks.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm hover:bg-muted/40 transition">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="size-3.5 text-brand/70" />
                    <span>
                      {(l.parentIds.map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown').join(' & '))}
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{people.find((p) => p.id === l.childId)?.givenName || 'Unknown'}</span>
                    </span>
                  </div>
                  <DeleteParentChildLinkDialog link={l} people={people} onDelete={deleteParentChildLink} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeleteUnionDialog({
  union,
  people,
  onDelete,
}: {
  union: { id: string; partnerIds: string[] };
  people: { id: string; givenName: string; familyName?: string }[];
  onDelete: (id: string) => Promise<void>;
}) {
  const partnerNames = union.partnerIds
    .map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown')
    .join(' + ');

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Delete union">
          <Trash className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Union</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the union between {partnerNames}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await onDelete(union.id);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Union
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteParentChildLinkDialog({
  link,
  people,
  onDelete,
}: {
  link: { id: string; parentIds: string[]; childId: string };
  people: { id: string; givenName: string; familyName?: string }[];
  onDelete: (id: string) => Promise<void>;
}) {
  const parentNames = link.parentIds
    .map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown')
    .join(' & ');
  const childName = people.find((p) => p.id === link.childId)?.givenName || 'Unknown';

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Delete parent-child link">
          <Trash className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Parent-Child Link</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the link between {parentNames} and {childName}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await onDelete(link.id);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SelectPerson({
  value,
  onChange,
  label,
  people,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  people: { id: string; givenName: string; familyName?: string }[];
}) {
  const [open, setOpen] = useState(false);

  const selectedPerson = people.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedPerson ? (
            `${selectedPerson.givenName} ${selectedPerson.familyName ?? ''}`
          ) : (
            `Select ${label}`
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder={`Search ${label}`} />
          <CommandList>
            <CommandEmpty>No person found.</CommandEmpty>
            <CommandGroup>
              {people.map((person) => (
                <CommandItem
                  key={person.id}
                  value={`${person.givenName} ${person.familyName ?? ''}`}
                  onSelect={() => {
                    onChange(person.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === person.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {person.givenName} {person.familyName ?? ''}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


