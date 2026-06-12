"use client";
import { useThemeStore } from "@/store/themes-store";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, TreePalm } from "lucide-react";
import "./globals.css";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { useActiveTreeStore } from "@/lib/activeTreeStore";
import { usePeopleStore } from "@/lib/store";
import { useRelationsStore } from "@/lib/relationsStore";
import { StatusBanner } from "@/components/StatusBanner";
import { TreeSwitcher } from "@/components/TreeSwitcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, toggleTheme } = useThemeStore();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Active-tree store wiring (task 9.1, Req 2.4-2.6, 8.2):
  // Subscribe to `isReady` so we can gate child rendering until the
  // Active_Tree has been resolved, and to `activeTreeId` so we can keep
  // the record stores in sync as the active tree changes.
  const isReady = useActiveTreeStore((s) => s.isReady);
  const activeTreeId = useActiveTreeStore((s) => s.activeTreeId);
  const bootstrap = useActiveTreeStore((s) => s.bootstrap);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Kick off the active-tree bootstrap once on mount. The store opens
  // Dexie (running the v2 upgrade if needed), resolves the Active_Tree,
  // persists the pointer, and re-hydrates the record stores. Children
  // below are gated on `isReady` so pages never see an unresolved
  // active-tree state (Req 2.4-2.6, 8.2).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Re-hydrate the record stores whenever `activeTreeId` changes so the
  // active-tree store stays the single coordinator of re-hydration.
  // Skip the initial run: at mount `activeTreeId` is `null`, and once
  // bootstrap() resolves it the store has already re-hydrated internally,
  // so we only react to SUBSEQUENT changes (e.g. user-driven switches via
  // setActiveTree, lifecycle ops, or imports).
  const skipNextHydrate = useRef(true);
  useEffect(() => {
    if (skipNextHydrate.current) {
      skipNextHydrate.current = false;
      return;
    }
    void usePeopleStore.getState().hydrate();
    void useRelationsStore.getState().hydrate();
  }, [activeTreeId]);

  if (!mounted) {
    // Optionally show a fallback loader
    return <html lang="en"><body /></html>;
  }

  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""}>
      <head>
        <title>Family Tree</title>
        <meta name="description" content="Build and visualize your family tree locally in your browser. Add people, define relationships, and explore your ancestry." />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-90 transition">
              <span className="inline-flex items-center justify-center size-8 rounded-md bg-brand/10 text-brand">
                <TreePalm className="size-4" />
              </span>
              <span className="text-base">Family Tree</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <NavigationMenu>
                <NavigationMenuList className="gap-1">
                  {[
                    { href: "/people", label: "People" },
                    { href: "/tree", label: "Tree" },
                    { href: "/relations", label: "Relationships" },
                    { href: "/data", label: "Data" },
                  ].map((item) => {
                    const active = pathname === item.href;
                    return (
                      <NavigationMenuItem key={item.href}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={item.href}
                            data-active={active}
                            className={
                              "relative inline-flex items-center px-3 py-1.5 rounded-md text-sm transition " +
                              (active
                                ? "text-foreground font-medium bg-brand/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted")
                            }
                          >
                            {item.label}
                          </Link>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    );
                  })}
                </NavigationMenuList>
              </NavigationMenu>
              {/*
                Mount the TreeSwitcher to the left of the theme toggle.
                It is gated on `isReady` so it only renders after the
                active-tree store has bootstrapped (Req 3.1, 3.2).
              */}
              {isReady && <TreeSwitcher />}
              <button
                type="button"
                aria-label="Toggle theme"
                onClick={toggleTheme}
                className="inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                {theme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>
            </div>
          </div>
        </header>
        <StatusBanner />
        <main className="mx-auto max-w-6xl w-full px-4 py-8 flex-1">
          {isReady ? children : null}
        </main>
        <footer className="border-t border-border/60 mt-12">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">
            Family Tree · Data stored locally in your browser
          </div>
        </footer>
      </body>
    </html>
  );
}
