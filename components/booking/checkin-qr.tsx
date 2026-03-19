"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

interface CheckInQrDialogProps {
  token: string;
  classTitle: string;
  date: string;
  startTime: string;
  onClose: () => void;
}

export function CheckInQrDialog({
  token,
  classTitle,
  date,
  startTime,
  onClose,
}: CheckInQrDialogProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-indigo-600" />
            Check-in QR Code
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col items-center gap-4">
          <p className="text-sm text-gray-600 text-center">
            <span className="font-medium text-gray-900">{classTitle}</span>
            <br />
            {date} at {startTime}
          </p>

          <div className="rounded-xl border-2 border-indigo-100 bg-white p-4">
            <QRCodeSVG
              value={token}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#1e1b4b"
            />
          </div>

          <div className="w-full">
            <p className="text-xs text-gray-400 text-center mb-1">Token</p>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <code className="flex-1 text-xs font-mono text-gray-600 truncate">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy token"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Show this QR code to staff when you arrive for class.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
