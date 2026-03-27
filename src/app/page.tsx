"use client";

import Link from "next/link";
import { usePeopleStore } from "@/lib/store";
import { useRelationsStore } from "@/lib/relationsStore";
import { useEffect } from "react";
import { Users, GitBranch, TreePalm } from "lucide-react";

export default function Home() {
  const { people, isHydrated, hydrate } = usePeopleStore();
  const { unions, parentChildLinks, isHydrated: relHydrated, hydrate: hydrateRelations } = useRelationsStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (!relHydrated) void hydrateRelations();
  }, [relHydrated, hydrateRelations]);

  const stats = isHydrated && relHydrated ? {
    people: people.length,
    unions: unions.length,
    links: parentChildLinks.length,
  } : null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Welcome to Family Tree</h1>
        <p className="text-sm text-black/70 dark:text-white/70 max-w-prose">
          Build your family tree locally in your browser. Start by adding people,
          then define relationships, and visualize the tree.
        </p>
      </div>

      {stats && stats.people > 0 && (
        <div className="flex gap-4">
          <div className="flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 px-4 py-3">
            <Users className="size-4 text-blue-500" />
            <span className="text-sm">{stats.people} people</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 px-4 py-3">
            <GitBranch className="size-4 text-green-500" />
            <span className="text-sm">{stats.unions} unions</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 px-4 py-3">
            <TreePalm className="size-4 text-amber-500" />
            <span className="text-sm">{stats.links} parent-child links</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50 uppercase tracking-wide">Get started</h2>
        <div className="grid grid-cols-3 gap-4 max-w-2xl">
          <Link
            href="/people"
            className="group rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-black/40 dark:text-white/30">1</span>
              <span className="font-medium text-sm">Add People</span>
            </div>
            <p className="text-xs text-black/50 dark:text-white/40">Add family members with names, birth dates, and gender.</p>
          </Link>
          <Link
            href="/relations"
            className="group rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-black/40 dark:text-white/30">2</span>
              <span className="font-medium text-sm">Define Relationships</span>
            </div>
            <p className="text-xs text-black/50 dark:text-white/40">Create unions between partners and link parents to children.</p>
          </Link>
          <Link
            href="/tree"
            className="group rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-black/40 dark:text-white/30">3</span>
              <span className="font-medium text-sm">View Tree</span>
            </div>
            <p className="text-xs text-black/50 dark:text-white/40">Visualize your family tree and export it as PNG or PDF.</p>
          </Link>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href="/people"
          className="inline-flex items-center rounded-md px-4 py-2 bg-white text-black dark:bg-white dark:text-black font-medium text-sm hover:bg-white/90 transition"
        >
          Go to People
        </Link>
        <Link
          href="/tree"
          className="inline-flex items-center rounded-md px-4 py-2 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 transition text-sm"
        >
          View Tree
        </Link>
      </div>
    </div>
  );
}
