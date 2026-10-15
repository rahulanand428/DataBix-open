/**
 * Colour maths for white-labelling. Brand colours are chosen by admins, so the
 * checks the dataviz palette passes offline are repeated here at runtime:
 * a brand colour only becomes the chart accent if it sits in the mode's OKLCH
 * lightness band, clears the chroma floor and reaches 3:1 on the chart surface.
 */

export type Mode = "light" | "dark";
type Rgb = [number, number, number];

export const SURFACES: Record<Mode, string> = { light: "#FCFCFB", dark: "#1A1A19" };
/** Validated categorical slot 1 per mode (fallback chart accent). */
export const DEFAULT_ACCENT: Record<Mode, string> = { light: "#2A78D6", dark: "#3987E5" };
const LIGHTNESS_BAND: Record<Mode, [number, number]> = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const CHROMA_FLOOR = 0.1;
const INK = "#0B0B0B";

export const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

const toRgb = (hex: string): Rgb => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number) => {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
};

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function toOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = toRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function fromOklch(l: number, c: number, h: number): string {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return toHex([fromLinear(r), fromLinear(g), fromLinear(b)]);
}

/** Text colour (white or ink) with the higher contrast on a filled background. */
export const onColor = (background: string): string =>
  contrast(background, "#FFFFFF") >= contrast(background, INK) ? "#FFFFFF" : INK;

/** Brand colour as a chart mark, if it passes the mode's band, chroma floor and 3:1 contrast. */
export function chartAccent(brand: string, mode: Mode): string {
  if (!isHex(brand)) return DEFAULT_ACCENT[mode];
  const { l, c } = toOklch(brand);
  const [min, max] = LIGHTNESS_BAND[mode];
  const passes = l >= min && l <= max && c >= CHROMA_FLOOR && contrast(brand, SURFACES[mode]) >= 3;
  return passes ? brand.toUpperCase() : DEFAULT_ACCENT[mode];
}

/** Brand colour used as link text: nudged in OKLCH lightness until it reaches 4.5:1 on the surface. */
export function readableOn(brand: string, mode: Mode): string {
  if (!isHex(brand)) return DEFAULT_ACCENT[mode];
  const surface = SURFACES[mode];
  if (contrast(brand, surface) >= 4.5) return brand.toUpperCase();
  const { l, c, h } = toOklch(brand);
  const step = mode === "light" ? -0.02 : 0.02;
  for (let next = l + step; next > 0 && next < 1; next += step) {
    const candidate = fromOklch(next, c, h);
    if (contrast(candidate, surface) >= 4.5) return candidate;
  }
  return mode === "light" ? INK : "#FFFFFF";
}
