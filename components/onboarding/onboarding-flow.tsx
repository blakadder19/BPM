"use client";

import { useState, useTransition, useEffect } from "react";
/* eslint-disable @next/next/no-img-element */
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { acceptCodeOfConductAction } from "@/lib/actions/code-of-conduct";
import type { CodeOfConductVersion } from "@/config/code-of-conduct";

interface Props {
  userName: string;
  coc: CodeOfConductVersion;
}

export function OnboardingFlow({ userName, coc }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!accepted) return;
    const t = setTimeout(() => {
      window.location.replace("/dashboard");
    }, 800);
    return () => clearTimeout(t);
  }, [accepted]);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptCodeOfConductAction();
      if (result.success) {
        setAccepted(true);
      } else {
        setError(result.error ?? "We couldn't save your acceptance. Please try again.");
      }
    });
  }

  if (accepted) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            You&apos;re all set!
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Redirecting to your dashboard…
          </p>
          <a
            href="/dashboard"
            className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Go to dashboard
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardContent className="pt-8 pb-8">
        <div className="mb-6 flex flex-col items-center">
          <img
            src="/branding/bpm-logo-full.jpg"
            alt="BPM"
            className="h-20 w-auto object-contain"
          />
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            Welcome, {userName}!
          </h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Before you can book classes, please review and accept our studio policy.
          </p>
        </div>

        <div className="mb-6 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {coc.title}
            <span className="ml-2 text-xs font-normal text-gray-400">
              v{coc.version} &middot; Updated {coc.lastUpdated}
            </span>
          </h3>
          {coc.sections.map((section) => (
            <div key={section.heading} className="mb-3 last:mb-0">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                {section.heading}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                {section.body}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          onClick={handleAccept}
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Accepting…" : "I Accept the Studio Policy"}
        </Button>
      </CardContent>
    </Card>
  );
}
