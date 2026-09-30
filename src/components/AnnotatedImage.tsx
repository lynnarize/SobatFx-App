"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { Shape, ShapeColor } from "@/lib/annotate";
import { useT } from "./i18n";

const COLORS: Record<ShapeColor, string> = { green: "#22b36b", red: "#e0453c", gold: "#d4b67c", blue: "#5b8def" };

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, s: number) {
  ctx.font = `600 ${Math.round(12 * s)}px ui-sans-serif, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 10 * s;
  const h = 18 * s;
  const bx = Math.min(Math.max(x, 2), ctx.canvas.width - w - 2);
  const by = Math.min(Math.max(y - h / 2, 2), ctx.canvas.height - h - 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 4 * s);
  ctx.fill();
  ctx.fillStyle = "#0b0b0c";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 5 * s, by + h / 2 + 0.5);
}

function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const l = 12 * s;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - l * Math.cos(a - 0.45), y2 - l * Math.sin(a - 0.45));
  ctx.lineTo(x2 - l * Math.cos(a + 0.45), y2 - l * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

/** Renders the user's uploaded chart with the AI's technical mark-up drawn on top. */
export function AnnotatedImage({ src, shapes }: { src: string; shapes: Shape[] }) {
  const { t } = useT();
  const [out, setOut] = useState<string | null>(null);
  // Parent re-parses the reply on every streamed chunk; key on content so we redraw only when shapes change.
  const key = JSON.stringify(shapes);

  useEffect(() => {
    let alive = true;
    const list: Shape[] = JSON.parse(key);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const s = Math.max(1, img.width / 700); // scale strokes/labels with the picture
      const X = (f: number) => f * c.width, Y = (f: number) => f * c.height;
      for (const sh of list) {
        const col = COLORS[sh.color];
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 2 * s;
        ctx.setLineDash([]);
        switch (sh.type) {
          case "hline":
            ctx.setLineDash([8 * s, 5 * s]);
            ctx.beginPath();
            ctx.moveTo(0, Y(sh.y));
            ctx.lineTo(c.width, Y(sh.y));
            ctx.stroke();
            ctx.setLineDash([]);
            if (sh.label) pill(ctx, sh.label, 6 * s, Y(sh.y), col, s);
            break;
          case "line":
          case "arrow":
            ctx.beginPath();
            ctx.moveTo(X(sh.x1), Y(sh.y1));
            ctx.lineTo(X(sh.x2), Y(sh.y2));
            ctx.stroke();
            if (sh.type === "arrow") arrowHead(ctx, X(sh.x1), Y(sh.y1), X(sh.x2), Y(sh.y2), s);
            if (sh.label) pill(ctx, sh.label, (X(sh.x1) + X(sh.x2)) / 2, (Y(sh.y1) + Y(sh.y2)) / 2 - 14 * s, col, s);
            break;
          case "box": {
            const x = Math.min(X(sh.x1), X(sh.x2)), y = Math.min(Y(sh.y1), Y(sh.y2));
            const w = Math.abs(X(sh.x2) - X(sh.x1)), h = Math.abs(Y(sh.y2) - Y(sh.y1));
            ctx.globalAlpha = 0.16;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1;
            ctx.strokeRect(x, y, w, h);
            if (sh.label) pill(ctx, sh.label, x + 4 * s, y - 12 * s, col, s);
            break;
          }
          case "text":
            pill(ctx, sh.text, X(sh.x), Y(sh.y), col, s);
            break;
        }
      }
      // Small watermark so shared images are traceable to the app.
      ctx.font = `600 ${Math.round(11 * s)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = "rgba(212,182,124,0.85)";
      ctx.textBaseline = "bottom";
      ctx.fillText("SobatFX AI", c.width - 80 * s, c.height - 6 * s);
      if (alive) setOut(c.toDataURL("image/jpeg", 0.9));
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, key]);

  if (!out) return null;
  return (
    <figure className="mt-3 overflow-hidden rounded-xl border border-gold-deep/40">
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, no optimisation needed */}
      <img src={out} alt={t("ai.annotated")} className="block w-full" />
      <figcaption className="flex items-center gap-2 bg-gold-soft px-3 py-1.5 text-xs text-gold">
        {t("ai.annotated")}
        <a href={out} download="sobatfx-analisis.jpg" className="ml-auto flex items-center gap-1 hover:text-ink">
          <Download size={12} /> {t("ai.download")}
        </a>
      </figcaption>
    </figure>
  );
}
