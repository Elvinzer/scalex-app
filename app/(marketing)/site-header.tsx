"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { NAV_LINKS } from "./content";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setMobileOpen(false)}>
          <Image src="/scalex-wordmark.png" alt="Scale X" width={132} height={44} priority className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-9 text-[14.5px] font-semibold text-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild className="rounded-[12px] px-6">
            <a href="/onboarding">Demander une démo</a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobileOpen}
          className="flex size-10 items-center justify-center rounded-[10px] border border-border text-foreground md:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-white px-6 py-5 md:hidden">
          <nav className="flex flex-col gap-4 text-[15px] font-semibold text-foreground">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            ))}
          </nav>
          <Button asChild className="mt-5 w-full rounded-[12px]">
            <a href="/onboarding">Demander une démo</a>
          </Button>
        </div>
      )}
    </header>
  );
}
