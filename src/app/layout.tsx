"use client";
import { useThemeStore } from "@/store/themes-store";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-black/10 dark:border-white/10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold hover:opacity-90">
              Family Tree
            </Link>
            <div className="flex items-center gap-3">
              <NavigationMenu className="gap-3">
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/people"
                        data-active={pathname === "/people"}
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
      </body>
    </html>
  );
}
