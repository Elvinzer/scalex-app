// Compatibility wrapper: the setter implementation is shared with the
// former Acquisition route and rendered here inside the Vente layout.
import { redirect } from "next/navigation";

export default function SettersRedirectPage() {
  redirect("/settings/equipe");
}
