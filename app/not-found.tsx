import type { Metadata } from "next";
import Link from "next/link";

import { Falco } from "@/components/falco/falco";

export const metadata: Metadata = {
  title: "Page introuvable · Scale X",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-mist px-6 text-center">
      <Falco variant="hero" size="lg" animate="enter" priority />
      <div>
        <h1 className="text-2xl font-bold">Falco n&apos;a pas trouvé cette page</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Le lien est cassé ou la page a été déplacée. Direction l&apos;accueil.
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center rounded-full border border-ink bg-white px-6 py-3 text-sm font-bold hover:opacity-65"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
