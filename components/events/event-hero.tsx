"use client";

import { useState } from "react";

interface EventHeroProps {
  coverImageUrl: string | null;
  title: string;
}

/**
 * Renders the event cover image as a poster (4:5 vertical, no cropping)
 * with automatic fallback to a branded gradient strip when no image
 * is set or when the remote image fails to load.
 */
export function EventHero({ coverImageUrl, title }: EventHeroProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const showImage = coverImageUrl && !imgFailed;

  if (!showImage) {
    return (
      <div className="h-3 bg-gradient-to-r from-bpm-500 via-bpm-coral to-bpm-400 rounded-t-xl" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverImageUrl}
      alt={title}
      className="w-full h-auto block"
      onError={() => setImgFailed(true)}
    />
  );
}
