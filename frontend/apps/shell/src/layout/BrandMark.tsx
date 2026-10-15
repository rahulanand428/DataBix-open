import { useBranding } from "@databix/sdk";

/** Default mark: an axis with a falling line (short selling). Replaced by an uploaded logo. */
export function DefaultMark() {
  return (
    <span className="dbx-mark" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4v16h16" />
        <path d="M8 8l4 4 3-3 5 6" />
      </svg>
    </span>
  );
}

export function BrandLockup({ compact }: { compact?: boolean }) {
  const { branding } = useBranding();
  if (branding.logo_data_url) {
    return <img src={branding.logo_data_url} alt={branding.product_name ?? "Logo"} />;
  }
  return (
    <>
      <DefaultMark />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span className="dbx-sidebar__name">{branding.product_name}</span>
        {!compact && branding.tagline && <span className="dbx-sidebar__tagline">{branding.tagline}</span>}
      </span>
    </>
  );
}
