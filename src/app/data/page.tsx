"use client";

import { useEffect, useState } from 'react';
import { exportData, importData, isSchemaEnvelopeV1, type ImportStrategy } from '@/lib/io';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DownloadIcon, Merge, RotateCcw, Users, GitBranch, TreePalm } from 'lucide-react';
import { usePeopleStore } from '@/lib/store';
import { useRelationsStore } from '@/lib/relationsStore';

export default function DataPage() {
  const [busy, setBusy] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>('replace');
  const [message, setMessage] = useState<string>('');

  const { people, isHydrated, hydrate } = usePeopleStore();
  const { unions, parentChildLinks, isHydrated: relHydrated, hydrate: hydrateRelations } = useRelationsStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (!relHydrated) void hydrateRelations();
  }, [relHydrated, hydrateRelations]);

  async function handleExport() {
    setBusy(true);
    setMessage('');
    try {
      const payload = await exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `family-tree-export-v${payload.version}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!isSchemaEnvelopeV1(json)) {
        setMessage('Invalid file: not a supported Family Tree export.');
        return;
      }
      const res = await importData(json, strategy);
      setMessage(`Imported ${res.people} people, ${res.unions} unions, ${res.parentChildLinks} links.`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Import failed';
      setMessage(errMsg);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const hasData = isHydrated && relHydrated;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Data</h2>

      <section className="space-y-3">
        <h3 className="font-medium">Export</h3>
        {hasData && people.length > 0 && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="size-3" /> {people.length} people</span>
            <span className="inline-flex items-center gap-1"><GitBranch className="size-3" /> {unions.length} unions</span>
            <span className="inline-flex items-center gap-1"><TreePalm className="size-3" /> {parentChildLinks.length} links</span>
          </div>
        )}
        <Button
          onClick={handleExport}
          disabled={busy}
        >
          <DownloadIcon className="w-4 h-4" />
          Download JSON
        </Button>
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Import</h3>
        <div className="flex items-center gap-3">
          {/* <Select
            value={strategy}
            onValueChange={(value) => setStrategy(value as ImportStrategy)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="replace">Replace (clear existing)</SelectItem>
              <SelectItem value="merge">Merge (upsert by id)</SelectItem>
            </SelectContent>
          </Select> */}
          <div className="flex gap-0">
            <Button
              variant={strategy === 'replace' ? 'default' : 'secondary'}
              className={`cursor-pointer ${strategy === 'replace' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-r-none w-[100px]`}
              onClick={() => {
                setStrategy('replace');
              }}
              aria-label="Replace"
            >
              <RotateCcw className="w-4 h-4" />
              Replace
            </Button>
            <Button
              variant={strategy === 'merge' ? 'default' : 'secondary'}
              className={`cursor-pointer ${strategy === 'merge' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-l-none w-[100px]`}
              onClick={() => {
                setStrategy('merge');
              }}
              aria-label="Merge"
            >
              <Merge className="w-4 h-4" /> Merge
            </Button>
          </div>
          <label className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-md px-4 h-9 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
              Choose file
            </span>
            <Input type="file" accept="application/json" onChange={handleImport} className="hidden" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          {strategy === 'replace'
            ? 'Replace clears all existing data before importing.'
            : 'Merge adds new records and updates existing ones by ID, keeping data not in the file.'}
        </p>
        {message ? <p className="text-sm text-black/70 dark:text-white/70">{message}</p> : null}
      </section>
    </div>
  );
}
