import { redirect } from "next/navigation";

// Kept as a compatibility route for bookmarks and old Copilote links. The
// canonical configuration and performance view now lives in Mon business.
export default function ProduitsPage() {
  redirect("/business#offres");
}
