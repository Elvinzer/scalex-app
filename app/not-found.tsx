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
      <Falco
        pose="sleeping"
        size="md"
        animate="enter"
        priority
        withBubble
        bubbleText="Je me suis perdu. On rentre à l'accueil ?"
      />
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <Link
        href="/"
        className="flex items-center rounded-full border border-ink bg-white px-6 py-3 text-sm font-bold hover:opacity-65"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
