"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { MultiSelect, type MultiSelectProps, type MultiSelectOption } from "@/components/multi-select";
import { AddPersonDialog } from "@/components/AddPersonDialog";

interface EnhancedMultiSelectProps extends Omit<MultiSelectProps, 'options'> {
  options: MultiSelectOption[];
  onPersonAdded?: (personId: string) => void;
  addPersonButtonText?: string;
  showAddPersonButton?: boolean;
}

export function EnhancedMultiSelect({
  onPersonAdded,
  addPersonButtonText = "Add Person",
  showAddPersonButton = true,
  options,
  onValueChange,
  ...multiSelectProps
}: EnhancedMultiSelectProps) {
  const [isAddPersonDialogOpen, setIsAddPersonDialogOpen] = useState(false);
  const multiSelectRef = useRef<any>(null);

  const handlePersonAdded = useCallback((personId: string) => {
    // Get current values and add the new person
    const currentValues = multiSelectRef.current?.getSelectedValues() || [];
    const newValues = [...currentValues, personId];
    
    // Update the MultiSelect with new values
    multiSelectRef.current?.setSelectedValues(newValues);
    onValueChange(newValues);
    setIsAddPersonDialogOpen(false);
    
    // Call the optional callback
    onPersonAdded?.(personId);
  }, [onValueChange, onPersonAdded]);

  // Enhanced options with "Add Person" option at the top
  const enhancedOptions = useMemo(() => {
    if (!showAddPersonButton) return options;
    
    const addPersonOption: MultiSelectOption = {
      label: addPersonButtonText,
      value: "__add_person__",
      icon: Plus,
      disabled: false,
    };
    
    return [addPersonOption, ...options];
  }, [options, showAddPersonButton, addPersonButtonText]);

  const handleValueChange = useCallback((values: string[]) => {
    // Check if the special "add person" value was selected
    if (values.includes("__add_person__")) {
      // Remove the special value immediately and open dialog
      const filteredValues = values.filter(v => v !== "__add_person__");
      
      // Reset the MultiSelect to the filtered values
      setTimeout(() => {
        multiSelectRef.current?.setSelectedValues(filteredValues);
      }, 0);
      
      onValueChange(filteredValues);
      setIsAddPersonDialogOpen(true);
      return;
    }
    
    // Normal selection change
    onValueChange(values);
  }, [onValueChange]);

  return (
    <>
      <MultiSelect
        {...multiSelectProps}
        ref={multiSelectRef}
        options={enhancedOptions}
        onValueChange={handleValueChange}
      />
      
      <AddPersonDialog
        open={isAddPersonDialogOpen}
        onOpenChange={setIsAddPersonDialogOpen}
        onPersonAdded={handlePersonAdded}
      />
    </>
  );
}
