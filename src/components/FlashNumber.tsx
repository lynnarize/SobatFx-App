"use client";

import { useState } from "react";

/** Renders a number that briefly flashes green/red when it goes up/down (re-keyed so the CSS animation replays). */
export function FlashNumber({ value, text, className = "" }: { value: number | null | undefined; text: string; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<{ dir: "" | "flash-up" | "flash-down"; n: number }>({ dir: "", n: 0 });
  // Adjust state while rendering when the prop changes (React's documented pattern for this).
  if (value !== prev) {
    setPrev(value);
    if (value != null && prev != null) setFlash((f) => ({ dir: value > prev ? "flash-up" : "flash-down", n: f.n + 1 }));
  }
  return (
    <span key={flash.n} className={`${className} ${flash.dir}`}>
      {text}
    </span>
  );
}
