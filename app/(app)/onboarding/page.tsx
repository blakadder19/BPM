import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getCocRepo } from "@/lib/repositories";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const cocAccepted = await getCocRepo().hasAcceptedVersion(
    user.id,
    CURRENT_CODE_OF_CONDUCT.version
  );

  if (cocAccepted) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <OnboardingFlow
        userName={user.fullName}
        coc={CURRENT_CODE_OF_CONDUCT}
      />
    </div>
  );
}
