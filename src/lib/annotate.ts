import { parseLooseJson } from "./loose-json";

// AI mark-up of a user-uploaded chart image (Pro/Ultra). The AI returns shapes in
// fractions of the image (x: 0 = left … 1 = right, y: 0 = top … 1 = bottom); the client
// draws them onto the picture. Separate from `sobatfx-draw`, which targets the live app chart.

export type ShapeColor = "green" | "red" | "gold" | "blue";

export type Shape =
  | { type: "hline"; y: number; label?: string; color: ShapeColor }
  | { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; label?: string; color: ShapeColor }
  | { type: "box"; x1: number; y1: number; x2: number; y2: number; label?: string; color: ShapeColor }
  | { type: "text"; x: number; y: number; text: string; color: ShapeColor };

const BLOCK = /```\s*sobatfx[-_ ]annotate\s*([\s\S]*?)(```|$)/i;

const frac = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
const str = (v: unknown, max = 32) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);

function colorOf(d: Record<string, unknown>): ShapeColor {
  const c = String(d.color ?? "").toLowerCase();
  if (c === "green" || c === "red" || c === "gold" || c === "blue") return c;
  if (d.kind === "demand" || /support|demand|buy|long|tp/i.test(String(d.label ?? ""))) return "green";
  if (d.kind === "supply" || /resist|supply|sell|short|sl\b/i.test(String(d.label ?? ""))) return "red";
  return "gold";
}

/** Splits an AI reply into display text and validated image shapes. Works on partial (streaming) text too. */
export function extractAnnotations(text: string) {
  const m = BLOCK.exec(text);
  if (!m) return { text, shapes: [] as Shape[], pending: false };
  const clean = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  if (m[2] !== "```") return { text: text.slice(0, m.index).trimEnd(), shapes: [], pending: true };
  const raw = parseLooseJson(m[1]);
  if (raw === undefined) return { text: clean, shapes: [], pending: false };
  const list = Array.isArray(raw) ? raw : ((raw as { shapes?: unknown[] })?.shapes ?? []);
  const out: Shape[] = [];
  for (const d of list.slice(0, 14) as Record<string, unknown>[]) {
    const color = colorOf(d);
    const x1 = frac(d.x1), y1 = frac(d.y1), x2 = frac(d.x2), y2 = frac(d.y2);
    switch (d.type) {
      case "hline": {
        const y = frac(d.y);
        if (y != null) out.push({ type: "hline", y, label: str(d.label), color });
        break;
      }
      case "line":
      case "arrow":
      case "box":
        if (x1 != null && y1 != null && x2 != null && y2 != null) out.push({ type: d.type, x1, y1, x2, y2, label: str(d.label), color });
        break;
      case "text": {
        const x = frac(d.x), y = frac(d.y);
        if (x != null && y != null && typeof d.text === "string") out.push({ type: "text", x, y, text: d.text.slice(0, 40), color });
        break;
      }
    }
  }
  return { text: clean, shapes: out.slice(0, 10), pending: false };
}

/** Downscale an uploaded image to a JPEG data URL (keeps requests and saved chats small). */
export function prepareUpload(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("type"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#111113";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}
