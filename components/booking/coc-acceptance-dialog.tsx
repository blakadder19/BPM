"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { acceptCodeOfConductAction } from "@/lib/actions/code-of-conduct";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";

interface CocAcceptanceDialogProps {
  onClose: () => void;
  onAccepted?: () => void;
}

export function CocAcceptanceDialog({ onClose, onAccepted }: CocAcceptanceDialogProps) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const coc = CURRENT_CODE_OF_CONDUCT;

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptCodeOfConductAction();
      if (result.success) {
        setDone(true);
        router.refresh();
        onAccepted?.();
      } else {
        setError(result.error ?? "Failed to accept");
      }
    });
  }

  if (done) {
    return (
      <Dialog open onClose={onClose}>
        <DialogContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-semibold text-gray-900">Code of Conduct Accepted</p>
            <p className="text-sm text-gray-500">You can now book classes.</p>
            <Button onClick={onClose}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-indigo-600" />
            {coc.title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] overflow-y-auto space-y-4">
          <p className="text-xs text-gray-400">
            Version {coc.version} — Last updated {coc.lastUpdated}
          </p>

          {coc.sections.map((section, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-gray-800">{section.heading}</h4>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{section.body}</p>
            </div>
          ))}

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">
              I have read and agree to the BPM Studio Policy
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={!accepted || isPending}>
            {isPending ? "Accepting…" : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CocReadOnlyDialogProps {
  onClose: () => void;
}

export function CocReadOnlyDialog({ onClose }: CocReadOnlyDialogProps) {
  const coc = CURRENT_CODE_OF_CONDUCT;

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-indigo-600" />
            {coc.title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] overflow-y-auto space-y-4">
          <p className="text-xs text-gray-400">
            Version {coc.version} — Last updated {coc.lastUpdated}
          </p>

          {coc.sections.map((section, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-gray-800">{section.heading}</h4>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{section.body}</p>
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
