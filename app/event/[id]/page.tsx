import { notFound } from "next/navigation";
import { getSpecialEventRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { isStripeEnabled } from "@/lib/stripe";
import { PublicEventPage } from "@/components/events/public-event-page";

export default async function PublicEventRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await ensureOperationalDataHydrated();

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(id);

  if (!event || event.status !== "published" || !event.isPublic) {
    notFound();
  }

  const sessions = await repo.getSessionsByEvent(id);
  const products = await repo.getProductsByEvent(id);
  const visibleProducts = products.filter((p) => p.isVisible && p.salesOpen);

  return (
    <PublicEventPage
      event={event}
      sessions={sessions}
      products={visibleProducts}
      stripeEnabled={isStripeEnabled()}
      allowReceptionPayment={event.allowReceptionPayment}
    />
  );
}
