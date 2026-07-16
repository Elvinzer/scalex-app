"use client";

import {
  Bot,
  LayoutDashboard,
  LogOut,
  Plug,
  Send,
  Settings,
  Stethoscope,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  // CSS color value — each section gets its own accent instead of one flat
  // blue everywhere, so the sidebar reads as a set of distinct tools.
  tint: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/diagnostic", label: "Diagnostic", icon: Stethoscope },
  { href: "/closing", label: "Closing", icon: Target },
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
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-border bg-card/80 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="brand-gradient flex size-8 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-[0_4px_16px_-4px_var(--signal)]">
          S
        </div>
        <span className="gradient-text font-display text-lg font-semibold tracking-tight">
          Scale X
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              style={
                active
                  ? {
                      backgroundColor: `color-mix(in oklch, ${item.tint} 12%, transparent)`,
                      color: item.tint,
                    }
                  : undefined
              }
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                !active && "text-foreground/70 hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" style={active ? { color: item.tint } : undefined} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="brand-gradient flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
