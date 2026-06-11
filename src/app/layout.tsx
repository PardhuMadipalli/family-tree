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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-black/10 dark:border-white/10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold hover:opacity-90 flex flex-row gap-2">
              <TreePalm className="w-6 h-6" /> Family Tree
            </Link>
            <div className="flex items-center gap-3">
              <NavigationMenu className="gap-3">
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/people"
                        data-active={pathname === "/people"}
                        className={pathname === "/people" ? "font-medium border-b-2 border-current pb-0.5" : ""}
                      >
                        People
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/tree"
                        data-active={pathname === "/tree"}
                        className={pathname === "/tree" ? "font-medium border-b-2 border-current pb-0.5" : ""}
                      >
                        Tree
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/relations"
                        data-active={pathname === "/relations"}
                        className={pathname === "/relations" ? "font-medium border-b-2 border-current pb-0.5" : ""}
                      >
                        Relationships
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/data"
                        data-active={pathname === "/data"}
                        className={pathname === "/data" ? "font-medium border-b-2 border-current pb-0.5" : ""}
                      >
                        Data
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
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
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </header>
        <StatusBanner />
        <main className="mx-auto max-w-6xl px-4 py-6">
          {isReady ? children : null}
        </main>
        <footer className="border-t border-black/5 dark:border-white/5 mt-12">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-black/40 dark:text-white/30">
            Family Tree · Data stored locally in your browser
          </div>
        </footer>
      </body>
    </html>
  );
}
