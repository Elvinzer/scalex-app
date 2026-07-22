"use client";

import { useRouter } from "next/navigation";

const OPTIONS: { value: string; label: string }[] = [
  { value: "3", label: "3 derniers mois" },
  { value: "6", label: "6 derniers mois" },
  { value: "12", label: "12 mois" },
  { value: "year", label: "Année en cours" },
];

export function PeriodSelect({ value }: { value: string }) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(event) => router.push(`/overview?period=${event.target.value}`)}
      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
