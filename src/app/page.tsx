"use client";

import Link from "next/link";
import { usePeopleStore } from "@/lib/store";
import { useRelationsStore } from "@/lib/relationsStore";
import { useEffect } from "react";
import { Users, Heart, GitBranch, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const steps = [
    {
      n: 1,
      title: "Add People",
      description: "Add family members with names, birth dates, and gender.",
      href: "/people",
    },
    {
      n: 2,
      title: "Define Relationships",
      description: "Create unions between partners and link parents to children.",
      href: "/relations",
    },
    {
      n: 3,
      title: "View Tree",
      description: "Visualize your family tree and export it as PNG or PDF.",
      href: "/tree",
    },
  ];

  return (
    <div className="space-y-12">
      <section className="space-y-4 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Welcome to Family Tree</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Build your family tree locally in your browser. Add people, define
          relationships, and visualize how everyone connects.
        </p>
      </section>

      {stats && stats.people > 0 && (
        <section className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border/70">
            <Stat icon={<Users className="size-4" />} value={stats.people} label="people" />
            <Stat icon={<Heart className="size-4" />} value={stats.unions} label={stats.unions === 1 ? "union" : "unions"} />
            <Stat icon={<GitBranch className="size-4" />} value={stats.links} label={stats.links === 1 ? "parent-child link" : "parent-child links"} />
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Get started</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {steps.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="group relative rounded-xl border border-border/70 bg-card p-5 shadow-xs hover:border-brand/40 hover:shadow-md transition flex flex-col gap-3"
            >
              <span className="inline-flex items-center justify-center size-8 rounded-full bg-brand/10 text-brand font-semibold text-sm">
                {step.n}
              </span>
              <div className="space-y-1">
                <div className="font-medium">{step.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-brand group-hover:translate-x-0.5 transition mt-auto" />
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/people">Go to People</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tree">View Tree</Link>
        </Button>
      </section>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="inline-flex items-center justify-center size-9 rounded-md bg-brand/10 text-brand">
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-xl font-semibold tabular-nums leading-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
