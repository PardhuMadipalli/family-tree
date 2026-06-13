"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePeopleStore } from "@/lib/store";
import { FuzzyDateInput } from "@/components/FuzzyDateInput";
import { compareFuzzyDates } from "@/lib/fuzzyDate";

type Gender = "male" | "female" | "other" | "unknown";

interface AddPersonDialogProps {
  onPersonAdded: (personId: string) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddPersonDialog({ onPersonAdded, trigger, open: controlledOpen, onOpenChange }: AddPersonDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [deathDate, setDeathDate] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const { addPerson } = usePeopleStore();

  const isValid = givenName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    try {
      const personId = await addPerson({
        givenName: givenName.trim(),
        familyName: familyName.trim() || undefined,
        birthDate: birthDate || undefined,
        deathDate: deathDate || undefined,
        gender,
      });

      onPersonAdded(personId);
      
      // Reset form
      setGivenName("");
      setFamilyName("");
      setBirthDate("");
      setDeathDate("");
      setGender("unknown");
      setOpen(false);
    } catch (error) {
      console.error("Failed to add person:", error);
    }
  };

  const handleCancel = () => {
    setGivenName("");
    setFamilyName("");
    setBirthDate("");
    setDeathDate("");
    setGender("unknown");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Person</DialogTitle>
          <DialogDescription>
            Create a new person to add to your family tree.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-givenName" className="text-right">
                First Name *
              </Label>
              <Input
                id="dialog-givenName"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className="col-span-3"
                placeholder="e.g., Ada"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-familyName" className="text-right">
                Last Name
              </Label>
              <Input
                id="dialog-familyName"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="col-span-3"
                placeholder="e.g., Lovelace"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-birthDate" className="text-right">
                Birth Date
              </Label>
              <div className="col-span-3">
                <FuzzyDateInput
                  id="dialog-birthDate"
                  value={birthDate}
                  onChange={setBirthDate}
                  ariaLabel="Birth date"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-deathDate" className="text-right">
                Death Date
              </Label>
              <div className="col-span-3 space-y-1">
                <FuzzyDateInput
                  id="dialog-deathDate"
                  value={deathDate}
                  onChange={setDeathDate}
                  ariaLabel="Death date"
                />
                {(() => {
                  const cmp = compareFuzzyDates(birthDate, deathDate);
                  if (cmp !== undefined && cmp > 0) {
                    return (
                      <p className="text-xs text-destructive">
                        Death date is before birth date.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-gender" className="text-right">
                Gender
              </Label>
              <Select
                value={gender}
                onValueChange={(value) => setGender(value as Gender)}
              >
                <SelectTrigger className="col-span-3">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              Add Person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
