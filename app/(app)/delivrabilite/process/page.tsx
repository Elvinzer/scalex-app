import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";

import { ProcessChecklist } from "./process-checklist";

export default async function ProcessPage() {
  const { userId } = await getCurrentUser();
  const profile = await getBusinessProfile(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-medium">Process</h1>
        <p className="mt-1 text-muted-foreground">
          Les étapes de ta délivrabilité — ce qui se passe une fois qu&apos;un client a acheté.
        </p>
      </div>

      <ProcessChecklist delivery={profile.delivery} />
    </div>
  );
}
