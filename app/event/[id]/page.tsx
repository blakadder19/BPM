import { notFound } from "next/navigation";
import { getSpecialEventRepo } from "@/lib/repositories";
import { isStripeEnabled } from "@/lib/stripe";
import { PublicEventPage } from "@/components/events/public-event-page";
import { shouldShowEventOnPublicPage } from "@/lib/domain/event-visibility";

// Public marketing route. We deliberately do NOT call
// `ensureOperationalDataHydrated()` here: this page only renders the
// event + sessions + visible products and never touches bookings,
// waitlist, attendance, penalties, or the finance audit log. Pulling
// the whole operational dataset for every social-link / bot / share
// preview hit was a major contributor to Supabase egress overage on
// the free tier.
export default async function PublicEventRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(id);

  // Phase 4: shouldShowEventOnPublicPage additionally excludes
  // archived events. Direct URL access to an archived event 404s.
  if (!event || !shouldShowEventOnPublicPage(event)) {
    notFound();
  }

  const sessions = await repo.getSessionsByEvent(id);
  const products = await repo.getProductsByEvent(id);
  const visibleProducts = products.filter((p) => p.isVisible && p.salesOpen);

  const purchaseParam = typeof sp.purchase === "string" ? sp.purchase : undefined;

  return (
    <PublicEventPage
      event={event}
      sessions={sessions}
      products={visibleProducts}
      stripeEnabled={isStripeEnabled()}
      allowReceptionPayment={event.allowReceptionPayment}
      purchaseStatus={purchaseParam as "success" | "cancelled" | undefined}
    />
  );
}
