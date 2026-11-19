"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveReceiptBusinessSettingsAction } from "@/lib/actions/receipt-settings";
import type { ReceiptBusinessField, ReceiptBusinessSettings } from "@/lib/domain/receipt-settings";

interface Props {
  initialSettings: ReceiptBusinessSettings;
  /** Academy name used as the receipt heading when no trading or legal name is set. */
  fallbackTradingName: string | null;
  canEdit: boolean;
}

const FIELDS: { key: ReceiptBusinessField; label: string; placeholder?: string; type?: string; wide?: boolean }[] = [
  { key: "tradingName", label: "Trading name" },
  { key: "legalName", label: "Legal name" },
  { key: "addressLine1", label: "Address line 1", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "postcode", label: "Postcode / Eircode" },
  { key: "country", label: "Country" },
  { key: "contactEmail", label: "Contact email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "website", label: "Website", placeholder: "https://" },
  { key: "companyNumber", label: "Company number" },
  { key: "vatNumber", label: "VAT number" },
];

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500";

function toFormValues(settings: ReceiptBusinessSettings): Record<ReceiptBusinessField, string> {
  const out = {} as Record<ReceiptBusinessField, string>;
  for (const [key, value] of Object.entries(settings) as [ReceiptBusinessField, string | null][]) {
    out[key] = value ?? "";
  }
  return out;
}

export function ReceiptBusinessCard({ initialSettings, fallbackTradingName, canEdit }: Props) {
  const [values, setValues] = useState(() => toFormValues(initialSettings));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function setField(key: ReceiptBusinessField, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await saveReceiptBusinessSettingsAction(values);
        if (res.success) {
          setValues(toFormValues(res.settings));
          setMessage({ ok: true, text: "Receipt details saved. New receipts will use them." });
        } else {
          setMessage({ ok: false, text: res.error });
        }
      } catch {
        setMessage({ ok: false, text: "Unexpected error. Nothing was saved." });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-bpm-600" />
          <CardTitle>Payment receipt details</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Printed on Payment Receipts. Every field is optional and blank fields are left off the receipt.
          {fallbackTradingName && (
            <> Without a trading or legal name, receipts are headed &ldquo;{fallbackTradingName}&rdquo;.</>
          )}{" "}
          The VAT breakdown is shown only when a VAT number is set and the purchase recorded VAT at the time.
          Amounts on past receipts never change.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
              <span className="block text-sm font-medium text-gray-700 mb-1">{f.label}</span>
              <input
                type={f.type ?? "text"}
                value={values[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                maxLength={200}
                disabled={!canEdit || pending}
                className={INPUT_CLASS}
              />
            </label>
          ))}
          <label className="sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 mb-1">Footer note</span>
            <textarea
              value={values.footerNote}
              onChange={(e) => setField("footerNote", e.target.value)}
              maxLength={500}
              rows={2}
              disabled={!canEdit || pending}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        {message && (
          <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save receipt details"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
