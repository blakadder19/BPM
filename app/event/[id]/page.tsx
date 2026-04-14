import { notFound } from "next/navigation";
import { getSpecialEventRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { isStripeEnabled } from "@/lib/stripe";
import { PublicEventPage } from "@/components/events/public-event-page";

export default async function PublicEventRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await ensureOperationalDataHydrated();

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(id);

  if (!event || event.status !== "published" || !event.isPublic) {
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
