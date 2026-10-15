import type { components } from "../api/schema";
import { chartAccent, onColor, readableOn, type Mode } from "./color";

export type Branding = components["schemas"]["PublicBranding"];
export type BrandingInput = components["schemas"]["BrandingConfig"];

export const DEFAULT_BRANDING: Branding = {
  product_name: "DataBix",
  tagline: "Short-selling intelligence",
  login_headline: "Market short-selling activity, at a glance",
  logo_data_url: null,
  favicon_data_url: null,
  primary_color: "#2563EB",
  accent_color: "#0D9488",
  sidebar_style: "dark",
  font_family: "Inter",
  radius: "default",
  default_theme: "system",
  footer_text: "",
  support_email: null,
  show_powered_by: true,
  customized: false,
};

const FONT_STACKS: Record<BrandingInput["font_family"] & string, string> = {
  Inter: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  "IBM Plex Sans": '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  "Source Sans 3": '"Source Sans 3 Variable", "Source Sans 3", system-ui, -apple-system, "Segoe UI", sans-serif',
  System: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** CSS custom properties for a brand in one mode (also used to scope a live preview). */
export function brandingVariables(branding: BrandingInput, mode: Mode): Record<string, string> {
  const primary = branding.primary_color ?? DEFAULT_BRANDING.primary_color!;
  return {
    "--dbx-primary": primary,
    "--dbx-on-primary": onColor(primary),
    "--dbx-accent": branding.accent_color ?? DEFAULT_BRANDING.accent_color!,
    "--dbx-link": readableOn(primary, mode),
    "--dbx-chart-1": chartAccent(primary, mode),
    "--dbx-font-sans": FONT_STACKS[branding.font_family ?? "Inter"],
  };
}

export function applyBranding(branding: Branding, mode: Mode): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(brandingVariables(branding, mode))) {
    root.style.setProperty(name, value);
  }
  root.dataset.sidebar = branding.sidebar_style ?? "dark";
  root.dataset.radius = branding.radius ?? "default";
  document.title = branding.product_name ?? "DataBix";
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.href = branding.favicon_data_url || "/favicon.svg";
    icon.type = branding.favicon_data_url ? branding.favicon_data_url.slice(5, branding.favicon_data_url.indexOf(";")) : "image/svg+xml";
  }
}
