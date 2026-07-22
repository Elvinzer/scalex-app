import Image from "next/image";

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "Produit", href: "#produit" },
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "Contact", href: "mailto:contact@scalex.app" },
  { label: "Mentions légales", href: "#" },
  { label: "Politique de confidentialité", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-[1360px] flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <Image src="/scalex-wordmark.png" alt="Scale X" width={110} height={37} className="h-7 w-auto" />

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-semibold text-muted-foreground">
          {FOOTER_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <p className="text-[12.5px] text-muted-foreground">© 2026 Scale X. Tous droits réservés.</p>
      </div>
    </footer>
  );
}
