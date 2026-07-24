import { redirect } from "next/navigation";

// Bare /ventes lands on Suivi des ventes — every account can reach it
// regardless of the Avancé gate (Closing may not be visible, see layout.tsx).
export default function VentesIndexPage() {
  redirect("/ventes/suivi");
}
