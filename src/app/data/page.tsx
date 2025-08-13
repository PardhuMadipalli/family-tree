"use client";

import { useState } from 'react';
import { exportData, importData, isSchemaEnvelopeV1, type ImportStrategy } from '@/lib/io';

export default function DataPage() {
  const [busy, setBusy] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>('replace');
  const [message, setMessage] = useState<string>('');

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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Data</h2>

      <section className="space-y-2">
        <h3 className="font-medium">Export</h3>
        <button
          onClick={handleExport}
          disabled={busy}
          className="inline-flex items-center rounded-md px-4 h-9 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          Download JSON
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Import</h3>
        <div className="flex items-center gap-3">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as ImportStrategy)}
            className="h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent"
          >
            <option value="replace">Replace (clear existing)</option>
            <option value="merge">Merge (upsert by id)</option>
          </select>
          <label className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-md px-4 h-9 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
              Choose file
            </span>
            <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
          </label>
        </div>
        {message ? <p className="text-sm text-black/70 dark:text-white/70">{message}</p> : null}
      </section>
    </div>
  );
}
