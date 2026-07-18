"use client";

// Listing photo that fails gracefully: source CDN links (especially old
// Facebook ones) expire — a broken-image icon is worse than no image, so
// onError the element removes itself.
import { useState } from "react";

export default function Thumb({
  src,
  alt = "",
  className = "",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [dead, setDead] = useState(false);
  if (dead) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setDead(true)} />;
}
