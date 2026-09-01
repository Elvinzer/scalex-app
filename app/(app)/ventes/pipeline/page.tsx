import { redirect } from "next/navigation";

// Compatibility URL. CRM is the canonical home for pipeline work.
export default function LegacyPipelinePage() {
  redirect("/crm/pipeline");
}
