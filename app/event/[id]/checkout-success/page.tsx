import Link from "next/link";
import { notFound } from "next/navigation";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { getSpecialEventRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { fulfillGuestEventPurchase } from "@/lib/actions/event-purchase";
import type { EmailSendResult } from "@/lib/communications/event-emails";

interface FulfillmentResult {
  status: "fulfilled" | "already_fulfilled" | "not_paid" | "error";
  eventTitle?: string;
  productName?: string;
  guestEmail?: string;
  emailResult?: EmailSendResult;
  error?: string;
}

async function verifyAndFulfill(
  eventId: string,
  sessionId: string,
): Promise<FulfillmentResult> {
  const tag = `[checkout-success event=${eventId} session=${sessionId.slice(0, 12)}...]`;

  if (!isStripeEnabled()) {
    console.error(`${tag} Stripe not configured`);
    return { status: "error", error: "Payment system is not configured" };
  }

  let session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${tag} Failed to retrieve Stripe session: ${msg}`);
    return { status: "error", error: "Could not verify payment session" };
  }

  if (session.payment_status !== "paid") {
    console.info(`${tag} Session payment_status=${session.payment_status} — not yet paid`);
    return { status: "not_paid" };
  }

  const metadata = (session.metadata ?? {}) as Record<string, string>;
  if (metadata.bpm_purchase_type !== "event_guest") {
    console.warn(`${tag} Session is not a guest event purchase (type=${metadata.bpm_purchase_type})`);
    return { status: "error", error: "This session is not a guest event purchase" };
  }

  if (metadata.bpm_event_id !== eventId) {
    console.warn(`${tag} Event ID mismatch: URL=${eventId} metadata=${metadata.bpm_event_id}`);
    return { status: "error", error: "Event mismatch" };
  }

  console.info(`${tag} Payment verified. Attempting fulfillment...`);
  const result = await fulfillGuestEventPurchase(sessionId, metadata);

  if (!result.success) {
    console.error(`${tag} Fulfillment failed: ${result.error}`);
    return { status: "error", error: result.error };
  }

  const repo = getSpecialEventRepo();
  const [event, products] = await Promise.all([
    repo.getEventById(eventId).catch(() => null),
    repo.getProductsByEvent(eventId).catch(() => [] as Awaited<ReturnType<typeof repo.getProductsByEvent>>),
  ]);
  const product = products.find((p) => p.id === metadata.bpm_event_product_id);

  console.info(`${tag} Fulfillment complete. emailSent=${result.emailResult?.sent ?? "unknown"}`);

  return {
    status: result.emailResult?.sent === false &&
      result.emailResult.reason?.startsWith("Already fulfilled")
      ? "already_fulfilled"
      : "fulfilled",
    eventTitle: event?.title,
    productName: product?.name,
    guestEmail: metadata.bpm_guest_email,
    emailResult: result.emailResult,
  };
}

export default async function GuestCheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  if (!sessionId) {
    notFound();
  }

  await ensureOperationalDataHydrated();
  const result = await verifyAndFulfill(eventId, sessionId);

  if (result.status === "not_paid") {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          </div>
          <h1 className="font-display text-xl font-bold text-gray-900">Payment not yet confirmed</h1>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            Your payment has not been confirmed yet. This can take a moment. Please check back shortly or contact the academy if it persists.
          </p>
          <Link href={`/event/${eventId}`} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
            Back to event
          </Link>
        </div>
      </Shell>
    );
  }

  if (result.status === "error") {
    return (
      <Shell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          </div>
          <h1 className="font-display text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            Your payment was received by Stripe, but we had trouble confirming your purchase.
            Please contact the academy so we can resolve this.
          </p>
          {result.error && (
            <p className="text-xs text-red-500 font-mono bg-red-50 border border-red-200 rounded px-3 py-1.5 inline-block">{result.error}</p>
          )}
          <div>
            <Link href={`/event/${eventId}`} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
              Back to event
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-gray-900">Purchase confirmed</h1>
          <p className="text-gray-600">Your payment was successful and your purchase is confirmed.</p>
        </div>

        {(result.eventTitle || result.productName) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-1.5 max-w-xs mx-auto text-left">
            {result.eventTitle && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Event</span>
                <span className="font-medium text-gray-900">{result.eventTitle}</span>
              </div>
            )}
            {result.productName && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ticket</span>
                <span className="font-medium text-gray-900">{result.productName}</span>
              </div>
            )}
          </div>
        )}

        <EmailStatusBlock emailResult={result.emailResult} guestEmail={result.guestEmail} />

        <div className="pt-2 space-y-3">
          <p className="text-sm text-gray-500">
            Show the QR code from your email at reception when you arrive.
          </p>
          <Link
            href={`/event/${eventId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            View event details
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function EmailStatusBlock({
  emailResult,
  guestEmail,
}: {
  emailResult?: EmailSendResult;
  guestEmail?: string;
}) {
  if (emailResult?.sent) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-2 max-w-sm mx-auto">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-800">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
          Confirmation email sent
        </div>
        {guestEmail && (
          <p className="text-xs text-emerald-700">
            A confirmation with your QR code has been sent to <strong>{guestEmail}</strong>.
          </p>
        )}
        <p className="text-xs text-gray-500">
          If you don&apos;t see it within a few minutes, check your spam folder.
        </p>
      </div>
    );
  }

  if (emailResult && !emailResult.sent && emailResult.reason?.startsWith("Already fulfilled")) {
    return (
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-2 max-w-sm mx-auto">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-blue-800">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
          Confirmation email was sent earlier
        </div>
        {guestEmail && (
          <p className="text-xs text-blue-700">
            Check <strong>{guestEmail}</strong> for your confirmation and QR code.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2 max-w-sm mx-auto">
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        Confirmation email could not be sent
      </div>
      <p className="text-xs text-amber-700">
        Your purchase is confirmed, but the confirmation email could not be sent right now.
        Please contact the academy if you need your QR code.
      </p>
      {emailResult && !emailResult.sent && (
        <p className="text-xs text-gray-400 font-mono">{emailResult.reason}</p>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-zinc-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <span className="font-display text-lg font-semibold tracking-tight">
            BPM Dance Academy
          </span>
          <Link
            href="/login"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        {children}
      </main>
      <footer className="text-center pb-8">
        <p className="text-xs text-gray-400">
          Balance Power Motion — Dublin&apos;s social dance academy
        </p>
      </footer>
    </div>
  );
}
