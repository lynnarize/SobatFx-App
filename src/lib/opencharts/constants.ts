// Drawing types from OpenCharts `src/pages/trading/constants.ts` (MIT, see ./LICENSE),
// trimmed to what the drawing tools need. SobatFX addition: `by` marks AI-made drawings.

/**
 * Armable tools. Some are placement-only aliases that commit a different stored
 * `type`: "ray"/"extended" store a "trendline" with extend flags;
 * "long-position"/"short-position" store a "position" with `side`; "measure" is
 * a transient gesture that never commits.
 */
export type DrawingTool =
  | "none"
  | "trendline"
  | "horizontal"
  | "fibonacci"
  | "rectangle"
  | "vertical"
  | "ray"
  | "extended"
  | "channel"
  | "text"
  | "fibextension"
  | "ellipse"
  | "arrow"
  | "triangle"
  | "position"
  | "long-position"
  | "short-position"
  | "measure";

/** Stored drawing kinds (excludes placement-only aliases). */
export type DrawingType = Exclude<DrawingTool, "none" | "ray" | "extended" | "long-position" | "short-position" | "measure">;

export type DrawingLineStyle = "solid" | "dashed" | "dotted";

/** Magnet snapping mode: off, weak (snap within a few px), or strong (always). */
export type MagnetMode = "none" | "weak" | "strong";

export interface DrawingLine {
  id: string;
  type: DrawingType;
  price: number;
  price2?: number;
  time?: number;
  time2?: number;
  /** Third anchor — parallel-channel offset line. */
  price3?: number;
  time3?: number;
  color: string;
  /** Line width in px (default 2). */
  width?: number;
  lineStyle?: DrawingLineStyle;
  /** Locked drawings can be selected but not moved or resized. */
  locked?: boolean;
  /** Trendline only: extend the line to the pane edges. */
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Hidden drawings stay in the object tree but don't render or hit-test. */
  hidden?: boolean;
  /** Render order — higher draws on top. Defaults to creation order. */
  zIndex?: number;
  /** Timeframe the drawing was created on (used by visibility "tf"). */
  createdTf?: string;
  /** "all" (default) shows on every timeframe; "tf" only on createdTf. */
  visibility?: "all" | "tf";
  /** Fill colour for shapes / channel / fib bands (defaults to `color`). */
  fillColor?: string;
  /** Fill opacity 0–1 (defaults per drawing kind). */
  fillOpacity?: number;
  /** Arrowheads on line ends (trendline / arrow). */
  arrowStart?: boolean;
  arrowEnd?: boolean;
  /** Text content + size for text/callout drawings and attachable labels. */
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textBg?: boolean;
  textBgColor?: string;
  textBorder?: boolean;
  textBorderColor?: string;
  /** Custom fibonacci levels (fractions); defaults applied when absent. */
  fibLevels?: number[];
  // ── Position tool (long/short risk-reward) ──
  side?: "long" | "short";
  stopPrice?: number;
  targetPrice?: number;
  /** % of account equity risked — drives size/$ readout (default 1). */
  riskPct?: number;
  // ── Price alerts on lines ──
  alertEnabled?: boolean;
  alertMessage?: string;
  /** SobatFX: who made the drawing. AI drawings render dashed in gold and can be cleared together. */
  by?: "user" | "ai";
}

/** Swatch palette for the drawing inspector. */
export const DRAWING_COLORS = ["#2196F3", "#f0b90b", "#0ecb81", "#f6465d", "#9c27b0", "#ff9800", "#787b86", "#ffffff"] as const;
