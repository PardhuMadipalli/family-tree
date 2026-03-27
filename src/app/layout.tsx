"use client";
import { useThemeStore } from "@/store/themes-store";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sun, TreePalm } from "lucide-react";
import "./globals.css";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

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

  useEffect(() => {
    setMounted(true);
  }, []);

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
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-black/5 dark:border-white/5 mt-12">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-black/40 dark:text-white/30">
            Family Tree · Data stored locally in your browser
          </div>
        </footer>
      </body>
    </html>
  );
}
