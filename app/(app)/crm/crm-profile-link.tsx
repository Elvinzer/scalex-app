import { ExternalLink } from "lucide-react";

function isAllowedProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return (url.protocol === "https:" || url.protocol === "http:") && (hostname === "instagram.com" || hostname === "linkedin.com");
  } catch {
    return false;
  }
}

export function CrmProfileLink({ href, label, iconOnly = false, className = "" }: { href: string | null; label: string; iconOnly?: boolean; className?: string }) {
  if (!href || !isAllowedProfileUrl(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={href}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-bold text-accent-text outline-none transition-colors hover:bg-accent-soft hover:underline focus-visible:ring-3 focus-visible:ring-accent/20 ${iconOnly ? "w-11" : ""} ${className}`}
    >
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}
