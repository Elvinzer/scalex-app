"use client";

import {
  Bot,
  Database,
  Filter,
  LayoutDashboard,
  LogOut,
  Plug,
  Settings,
  Store,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/business", label: "Mon business", icon: Store },
  { href: "/funnel", label: "Funnel", icon: Filter },
  { href: "/datas", label: "Datas", icon: Database },
  { href: "/diagnostic", label: "Diagnostic", icon: Stethoscope },
  { href: "/agent", label: "Agent IA", icon: Bot },
  { href: "/integrations", label: "Intégrations", icon: Plug },
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-ink px-3 py-7 text-mist">
      <div className="flex items-center gap-2.5 px-3 pb-7">
        <div className="flex size-8 items-center justify-center rounded-lg border border-mist bg-signal text-sm font-medium text-ink">
          S
        </div>
        <span className="font-display text-lg font-medium tracking-tight">Scale X</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                active ? "bg-white/10 text-on-dark" : "text-mist/75 hover:bg-mist/10 hover:text-mist"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-mist/15 px-3 pt-4">
        <div className="flex items-center gap-3 rounded-xl px-1 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-on-dark">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-mist/85">{email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            className="flex size-7 items-center justify-center rounded-lg text-mist/60 transition-colors hover:bg-state-critical/20 hover:text-state-critical"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
