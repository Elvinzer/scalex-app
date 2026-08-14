import { redirect } from "next/navigation";

export default async function FrenchReservationSettingsAlias({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  redirect(`/settings/reservation${query.toString() ? `?${query.toString()}` : ""}`);
}

