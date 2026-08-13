import Image from "next/image";
import { useTranslations } from "next-intl";

const FOOTER_LINKS = [
  { labelKey: "footer.features", href: "/#fonctionnalites" },
  { labelKey: "footer.product", href: "/#produit" },
  { labelKey: "footer.pricing", href: "/#tarifs" },
  { labelKey: "footer.resources", href: "/ressources/coach-business-scaling" },
  { labelKey: "footer.contact", href: "mailto:contact@scalex.app" },
  { labelKey: "footer.privacy", href: "/politique-de-confidentialite" },
] as const;

export function SiteFooter() {
  const t = useTranslations("marketing");

  return (
    <footer className="border-t border-white/10 px-6 py-10 sm:px-10" style={{ background: "var(--gradient-dark)" }}>
      <div className="mx-auto flex max-w-[1360px] flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <Image
          src="/scalex-wordmark.png"
          alt={t("nav.home")}
          width={398}
          height={100}
          sizes="159px"
          className="h-12 w-auto"
        />

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-semibold text-mist/70">
          {FOOTER_LINKS.map((link) => (
            <a key={link.labelKey} href={link.href} className="transition-colors hover:text-mist">
              {t(link.labelKey)}
            </a>
          ))}
        </nav>

        <p className="text-[12.5px] text-mist/50">{t("footer.copyright")}</p>
      </div>
    </footer>
  );
}
