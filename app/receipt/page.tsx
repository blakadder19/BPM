import type { Metadata } from "next";
import { GuestReceiptOpener } from "@/components/receipts/guest-receipt-opener";

export const metadata: Metadata = {
  title: "Payment receipt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function GuestReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ unavailable?: string }>;
}) {
  const { unavailable } = await searchParams;
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-16">
      <GuestReceiptOpener unavailable={unavailable === "1"} />
    </div>
  );
}
