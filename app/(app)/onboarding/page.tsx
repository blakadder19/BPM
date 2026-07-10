import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getCocRepo } from "@/lib/repositories";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ConversionTracker } from "@/components/analytics/conversion-tracker";
import { isMetaPixelConfigured } from "@/lib/analytics/tracking";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const cocAccepted = await getCocRepo().hasAcceptedVersion(
    user.id,
    CURRENT_CODE_OF_CONDUCT.version
  );

  if (cocAccepted) {
    redirect("/dashboard");
  }

  // Meta Pixel: `?welcome=1` is set only by the auto-confirm branch of
  // the signup flow (`app/(auth)/signup/page.tsx`). It's the sole
  // client-side moment we can prove the account was just created for
  // that flow (email-confirm branch fires CompleteRegistration on
  // `/login?confirmed=1` instead). The ConversionTracker keys dedup
  // on user id so refreshing onboarding cannot double-fire.
  const sp = (await searchParams) ?? {};
  const welcome = sp.welcome === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <OnboardingFlow
        userName={user.fullName}
        coc={CURRENT_CODE_OF_CONDUCT}
      />
      {welcome && (
        <ConversionTracker
          metaEventName={
            isMetaPixelConfigured() ? "CompleteRegistration" : null
          }
          transactionId={user.id}
          dedupEventName="signup_auto_confirmed"
        />
      )}
    </div>
  );
}
