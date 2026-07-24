import { redirect } from "next/navigation";

// Bare /acquisition always lands on its first tab — Contenu is the one
// every account can reach regardless of the Avancé gate (Setting/Ads may
// not be visible yet, see layout.tsx).
export default function AcquisitionIndexPage() {
  redirect("/acquisition/contenu");
}
