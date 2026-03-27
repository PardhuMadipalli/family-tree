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
import { Check, ChevronsUpDown, Trash } from 'lucide-react';
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
      <h2 className="text-xl font-semibold">Relationships</h2>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-medium">Create union (partners)</h3>
          {unions.length > 0 && (
            <span className="text-xs text-muted-foreground">{unions.length} union{unions.length !== 1 ? 's' : ''}</span>
          )}
        </div>
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
        <div className="space-y-1 max-w-2xl">
          {unions.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border border-black/5 dark:border-white/5 px-3 py-2 text-sm hover:bg-muted/30 transition">
              <span>
                {u.partnerIds.map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown').join(' + ')}
              </span>
              <DeleteUnionDialog union={u} people={people} onDelete={deleteUnion} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-medium">Create parent → child link</h3>
          {parentChildLinks.length > 0 && (
            <span className="text-xs text-muted-foreground">{parentChildLinks.length} link{parentChildLinks.length !== 1 ? 's' : ''}</span>
          )}
        </div>
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
        <div className="space-y-1 max-w-2xl">
          {parentChildLinks.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-black/5 dark:border-white/5 px-3 py-2 text-sm hover:bg-muted/30 transition">
              <span>
                {(l.parentIds.map((id) => people.find((p) => p.id === id)?.givenName || 'Unknown').join(' & '))}
                {' → '}
                {people.find((p) => p.id === l.childId)?.givenName || 'Unknown'}
              </span>
              <DeleteParentChildLinkDialog link={l} people={people} onDelete={deleteParentChildLink} />
            </div>
          ))}
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
        <Button variant="destructive" size="icon">
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
        <Button variant="destructive" size="icon">
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


