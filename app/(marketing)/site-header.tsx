"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NAV_LINKS } from "./content";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const sections = NAV_LINKS.map((link) => document.getElementById(link.href.slice(1))).filter(
      (el): el is HTMLElement => el !== null,
    );

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/10"
      style={{ background: "var(--gradient-dark)" }}
    >
      <div className="mx-auto flex h-24 max-w-[1360px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setMobileOpen(false)}>
          <Image src="/scalex-wordmark.png" alt="Scale X" width={398} height={100} priority className="h-14 w-auto" />
        </Link>

        <nav className="hidden items-center gap-9 text-[14.5px] font-semibold text-mist/75 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "transition-colors hover:text-accent",
                activeId === link.href.slice(1) && "text-accent",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild className="rounded-[12px] px-6">
            <a href="/sign-in">Se connecter</a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobileOpen}
          className="flex size-10 items-center justify-center rounded-[10px] border border-white/20 text-mist md:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 px-6 py-5 md:hidden" style={{ background: "var(--gradient-dark)" }}>
          <nav className="flex flex-col gap-4 text-[15px] font-semibold text-mist/85">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "transition-colors",
                  activeId === link.href.slice(1) && "text-accent",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Button asChild className="mt-5 w-full rounded-[12px]">
            <a href="/sign-in">Se connecter</a>
          </Button>
        </div>
      )}
    </header>
  );
}
