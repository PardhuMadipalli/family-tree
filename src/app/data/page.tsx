"use client";

import { useEffect, useState } from 'react';
import { exportActiveTree, isSchemaEnvelopeV1 } from '@/lib/io';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DownloadIcon, GitBranch, TreePalm, Users } from 'lucide-react';
import { usePeopleStore } from '@/lib/store';
import { useRelationsStore } from '@/lib/relationsStore';
import { useActiveTreeStore } from '@/lib/activeTreeStore';

export default function DataPage() {
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string>('');
  const [importMessage, setImportMessage] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importName, setImportName] = useState<string>('');

  const { people, isHydrated, hydrate } = usePeopleStore();
  const {
    unions,
    parentChildLinks,
    isHydrated: relHydrated,
    hydrate: hydrateRelations,
  } = useRelationsStore();

  const { trees, activeTreeId, importAsNewTree } = useActiveTreeStore();
  const activeTree = trees.find((t) => t.id === activeTreeId);
  const activeTreeName = activeTree?.name ?? '<no tree>';
  const hasActiveTree = activeTreeId !== null;

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (!relHydrated) void hydrateRelations();
  }, [relHydrated, hydrateRelations]);

  async function handleExport() {
    if (!activeTreeId) return;
    setBusy(true);
    setExportError('');
    try {
      // Scoped export: only the active tree's records, treeId stripped to
      // keep the file portable (Req 9.1, 9.5).
      const payload = await exportActiveTree(activeTreeId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Include the active tree name in the filename so users can tell
      // multiple exports apart at a glance.
      const safeName = activeTreeName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'tree';
      a.download = `family-tree-${safeName}-v${payload.version}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Failure surfaces a non-technical message; `exportActiveTree` only
      // reads, so the registry/records are inherently unchanged (Req 9.4).
      setExportError('Export did not complete');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportMessage('');
    setImportError('');

    // Reset the file input now so the user can re-pick the same file later
    // even if this attempt fails. Capture the name first because we still
    // pass it to the import flow as a fallback for tree naming (Req 7.8).
    const fileName = file.name;
    e.target.value = '';

    // 1) Read + parse JSON. Any failure here is "could not be read" (Req 7.2).
    let json: unknown;
    try {
      const text = await file.text();
      json = JSON.parse(text);
    } catch {
      setImportError('The file could not be read');
      setBusy(false);
      return;
    }

    // 2) Validate against SchemaEnvelopeV1 before touching anything (Req 7.1, 7.3).
    if (!isSchemaEnvelopeV1(json)) {
      setImportError('The file failed validation');
      setBusy(false);
      return;
    }

    // Capture counts BEFORE the import so the success message reflects
    // exactly what the file contained, regardless of how the active-tree
    // store reports the new tree.
    const counts = {
      people: json.people.length,
      unions: json.unions.length,
      parentChildLinks: json.parentChildLinks.length,
    };

    try {
      const result = await importAsNewTree(json, importName, fileName);
      if (!result.ok) {
        setImportError('The file could not be imported');
        return;
      }
      setImportMessage(
        `Imported ${counts.people} people, ${counts.unions} unions, ${counts.parentChildLinks} links into "${result.tree.name}".`,
      );
      // Clear the optional name field so the next import starts fresh.
      setImportName('');
    } finally {
      setBusy(false);
    }
  }

  const recordsHydrated = isHydrated && relHydrated;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Data</h2>
          <p className="text-sm text-muted-foreground">
            Export the active tree, or import another JSON file as a new tree.
          </p>
        </div>
        <div className="text-sm text-muted-foreground text-right">
          <div className="text-xs uppercase tracking-wider">Active tree</div>
          <div className="font-medium text-foreground">{activeTreeName}</div>
        </div>
      </header>

      {!hasActiveTree && (
        <p className="text-sm text-muted-foreground">
          Select or create a tree to export or import data.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>
            Download the active tree as a JSON file you can back up or import as a new tree later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasActiveTree && recordsHydrated && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <Users className="size-3.5 text-brand" /> {people.length} people
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <GitBranch className="size-3.5 text-brand" /> {unions.length} unions
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <TreePalm className="size-3.5 text-brand" /> {parentChildLinks.length} links
              </span>
            </div>
          )}
          <Button onClick={handleExport} disabled={busy || !hasActiveTree}>
            <DownloadIcon className="size-4" />
            Download JSON
          </Button>
          {exportError ? (
            <p className="text-sm text-destructive">{exportError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import as new tree</CardTitle>
          <CardDescription>
            Load a JSON export as a brand-new tree. Existing trees are not modified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1.5 max-w-md">
            <label className="text-xs text-muted-foreground" htmlFor="import-tree-name">
              New tree name (optional)
            </label>
            <Input
              id="import-tree-name"
              type="text"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="Leave blank to use the file name"
              disabled={busy || !hasActiveTree}
              maxLength={200}
            />
          </div>
          <label className={`group flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/70 bg-muted/20 px-6 py-8 transition max-w-md ${busy || !hasActiveTree ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-brand/50 hover:bg-brand/5'}`}>
            <span className="inline-flex items-center justify-center size-10 rounded-full bg-brand/10 text-brand">
              <DownloadIcon className="size-5 rotate-180" />
            </span>
            <span className="text-sm font-medium">Choose a JSON file</span>
            <span className="text-xs text-muted-foreground">or drag and drop</span>
            <Input
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
              disabled={busy || !hasActiveTree}
            />
          </label>
          {importMessage ? (
            <p className="text-sm text-brand">{importMessage}</p>
          ) : null}
          {importError ? (
            <p className="text-sm text-destructive">{importError}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
