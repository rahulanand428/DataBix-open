import {
  DEFAULT_BRANDING,
  brandingVariables,
  chartAccent,
  isHex,
  useAdminMutations,
  useBranding,
  useBrandingDetails,
  useTheme,
  type BrandingInput,
  type Mode,
} from "@databix/sdk";
import {
  Alert,
  BarList,
  Button,
  Card,
  ColorInput,
  Dialog,
  Field,
  Grid,
  Input,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  formatDateTime,
  useToast,
} from "@databix/ui";
import { ChartLine, ImageUp, LayoutDashboard, Moon, RotateCcw, Save, Star, Sun, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";

import { AdminTabs } from "./AdminTabs";

type Draft = Required<Omit<BrandingInput, "logo_data_url" | "favicon_data_url" | "support_email">> & {
  logo_data_url: string | null;
  favicon_data_url: string | null;
  support_email: string | null;
};

const FIELDS = [
  "product_name",
  "tagline",
  "login_headline",
  "logo_data_url",
  "favicon_data_url",
  "primary_color",
  "accent_color",
  "sidebar_style",
  "font_family",
  "radius",
  "default_theme",
  "footer_text",
  "support_email",
  "show_powered_by",
] as const;

const toDraft = (source: Partial<BrandingInput>): Draft =>
  Object.fromEntries(
    FIELDS.map((field) => [field, source[field] ?? (DEFAULT_BRANDING as Record<string, unknown>)[field] ?? null]),
  ) as Draft;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function ImageField({
  label,
  value,
  maxKb,
  hint,
  onChange,
  background = "var(--dbx-surface-2)",
}: {
  label: string;
  value: string | null;
  maxKb: number;
  hint: string;
  onChange: (value: string | null) => void;
  /** Preview on the colour the image will sit on. */
  background?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a PNG, JPEG or WebP image (SVG is not accepted).");
    if (file.size > maxKb * 1024) return setError(`The image must be ${maxKb} KB or smaller.`);
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      onChange(String(reader.result));
    };
    reader.readAsDataURL(file);
  };
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="dbx-row" style={{ ["--dbx-gap" as string]: "10px" }}>
        <div
          style={{
            width: 120,
            height: 44,
            borderRadius: "var(--dbx-radius-sm)",
            border: "1px dashed var(--dbx-border-strong)",
            display: "grid",
            placeItems: "center",
            background,
            overflow: "hidden",
          }}
        >
          {value ? <img src={value} alt={`${label} preview`} style={{ maxHeight: 36, maxWidth: 110, objectFit: "contain" }} /> : <span className="dbx-muted" style={{ fontSize: 12 }}>None</span>}
        </div>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} onChange={pick} hidden />
        <Button size="sm" icon={ImageUp} onClick={() => input.current?.click()}>Upload</Button>
        {value && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(null)}>Remove</Button>}
      </div>
    </Field>
  );
}

function Preview({ draft, mode }: { draft: Draft; mode: Mode }) {
  const style = {
    ...brandingVariables(draft, mode),
    fontFamily: "var(--dbx-font-sans)",
  } as CSSProperties;
  return (
    <div className="dbx-brand-scope dbx-preview" data-sidebar={draft.sidebar_style} data-radius={draft.radius} style={style} aria-label="Branding preview">
      <div className="dbx-preview__side">
        <div className="dbx-row" style={{ ["--dbx-gap" as string]: "8px", padding: "2px 4px 10px" }}>
          {draft.logo_data_url ? (
            <img src={draft.logo_data_url} alt="" style={{ maxHeight: 24, maxWidth: 126, objectFit: "contain" }} />
          ) : (
            <>
              <span className="dbx-mark" style={{ width: 22, height: 22 }}>
                <ChartLine size={13} aria-hidden />
              </span>
              <strong style={{ fontSize: 12.5 }}>{draft.product_name || "Product"}</strong>
            </>
          )}
        </div>
        {[
          ["Overview", LayoutDashboard, true],
          ["Symbols", ChartLine, false],
          ["Watchlist", Star, false],
        ].map(([label, Icon, active]) => {
          const NavIcon = Icon as typeof LayoutDashboard;
          return (
            <span key={label as string} className="dbx-nav-link" aria-current={active ? "page" : undefined} style={{ fontSize: 12, padding: "5px 8px" }}>
              <NavIcon aria-hidden style={{ width: 14, height: 14 }} />
              {label as string}
            </span>
          );
        })}
      </div>
      <div className="dbx-preview__main">
        <div className="dbx-row dbx-row--between">
          <div>
            <div className="dbx-muted" style={{ fontSize: 11 }}>{draft.tagline}</div>
            <h2>Overview</h2>
          </div>
          <Button size="sm" variant="primary">Primary action</Button>
        </div>
        <div className="dbx-card" style={{ padding: 12 }}>
          <div className="dbx-muted" style={{ fontSize: 11.5 }}>Shares shorted</div>
          <div style={{ fontSize: 22, fontWeight: 650 }}>48.2M</div>
          <a href="#preview" onClick={(event) => event.preventDefault()} style={{ fontSize: 12 }}>A link in the brand colour</a>
        </div>
        <div className="dbx-card" style={{ padding: "8px 4px" }}>
          <BarList
            items={[
              { key: "a", label: "ABFRL", value: 1512 },
              { key: "b", label: "M&M", value: 980 },
              { key: "c", label: "ABB", value: 450 },
            ]}
          />
        </div>
        {draft.footer_text && <div className="dbx-muted" style={{ fontSize: 11 }}>{draft.footer_text}</div>}
      </div>
    </div>
  );
}

export function BrandingPage() {
  const { branding } = useBranding();
  const { mode } = useTheme();
  const { saveBranding, resetBranding } = useAdminMutations();
  const details = useBrandingDetails();
  const toast = useToast();
  const saved = useMemo(() => toDraft(branding), [branding]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [previewMode, setPreviewMode] = useState<Mode>(mode);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const colorsValid = isHex(draft.primary_color) && isHex(draft.accent_color);
  const chartFallback = (["light", "dark"] as const).filter(
    (candidate) => isHex(draft.primary_color) && chartAccent(draft.primary_color, candidate) !== draft.primary_color.toUpperCase(),
  );

  const save = async () => {
    setError(null);
    try {
      await saveBranding.mutateAsync({ ...draft, support_email: draft.support_email || null });
      toast.show("Branding saved. Everyone sees it on their next page load.", "good");
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    try {
      await resetBranding.mutateAsync();
      toast.show("Branding reset to the deployment defaults.", "good");
    } catch (caught) {
      toast.show((caught as Error).message, "critical");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Administration"
        description="White-label the app: name, logo, colours, typography and theme. Changes apply to every user, including the sign-in page."
        actions={
          <>
            {branding.customized && <Button icon={RotateCcw} onClick={() => setConfirmReset(true)}>Reset to defaults</Button>}
            <Button icon={Undo2} disabled={!dirty} onClick={() => setDraft(saved)}>Discard</Button>
            <Button variant="primary" icon={Save} disabled={!dirty || !colorsValid || !draft.product_name.trim()} loading={saveBranding.isPending} onClick={save}>
              Save branding
            </Button>
          </>
        }
      />
      <AdminTabs />
      {error && <Alert tone="critical" title="Branding was not saved">{error}</Alert>}
      <Grid columns={2} style={{ alignItems: "start" }}>
        <Stack>
          <Card title="Identity">
            <Stack gap={14}>
              <Field label="Product name" htmlFor="brand-name">
                <Input id="brand-name" value={draft.product_name} maxLength={40} onChange={(event) => set("product_name", event.target.value)} />
              </Field>
              <Field label="Tagline" htmlFor="brand-tagline" hint="Shown under the name in the sidebar.">
                <Input id="brand-tagline" value={draft.tagline} maxLength={80} onChange={(event) => set("tagline", event.target.value)} />
              </Field>
              <Field label="Sign-in headline" htmlFor="brand-headline">
                <Input id="brand-headline" value={draft.login_headline} maxLength={100} onChange={(event) => set("login_headline", event.target.value)} />
              </Field>
              <ImageField
                label="Logo"
                background={draft.sidebar_style === "brand" ? draft.primary_color : draft.sidebar_style === "dark" ? "#121211" : "var(--dbx-surface)"}
                value={draft.logo_data_url}
                maxKb={200}
                hint="PNG, JPEG or WebP up to 200 KB; replaces the name in the sidebar (previewed on the sidebar colour). A wide logo on a transparent background works best."
                onChange={(value) => set("logo_data_url", value)}
              />
              <ImageField label="Favicon" value={draft.favicon_data_url} maxKb={32} hint="Square PNG up to 32 KB." onChange={(value) => set("favicon_data_url", value)} />
            </Stack>
          </Card>
          <Card title="Look and feel">
            <Stack gap={14}>
              <Grid columns={2} gap={12}>
                <Field label="Primary colour" htmlFor="brand-primary" hint="Buttons, active navigation, chart accent.">
                  <ColorInput id="brand-primary" aria-label="Primary colour" value={draft.primary_color} onChange={(value) => set("primary_color", value)} />
                </Field>
                <Field label="Accent colour" htmlFor="brand-accent">
                  <ColorInput id="brand-accent" aria-label="Accent colour" value={draft.accent_color} onChange={(value) => set("accent_color", value)} />
                </Field>
              </Grid>
              {chartFallback.length > 0 && (
                <Alert tone="warning" title="Charts will keep the default blue">
                  This colour is too light, too dark or too grey to read as a chart mark in {chartFallback.join(" and ")} mode,
                  so charts fall back to an accessible blue there. Buttons and navigation still use it.
                </Alert>
              )}
              <Field label="Sidebar">
                <SegmentedControl
                  label="Sidebar style"
                  value={draft.sidebar_style}
                  onChange={(value) => set("sidebar_style", value)}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                    { value: "brand", label: "Brand colour" },
                  ]}
                />
              </Field>
              <Grid columns={2} gap={12}>
                <Field label="Font" htmlFor="brand-font">
                  <Select id="brand-font" value={draft.font_family} onChange={(event) => set("font_family", event.target.value as Draft["font_family"])}>
                    {["Inter", "IBM Plex Sans", "Source Sans 3", "System"].map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default theme" htmlFor="brand-theme" hint="People can still choose their own.">
                  <Select id="brand-theme" value={draft.default_theme} onChange={(event) => set("default_theme", event.target.value as Draft["default_theme"])}>
                    <option value="system">Match system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </Select>
                </Field>
              </Grid>
              <Field label="Corners">
                <SegmentedControl
                  label="Corner radius"
                  value={draft.radius}
                  onChange={(value) => set("radius", value)}
                  options={[
                    { value: "sharp", label: "Sharp" },
                    { value: "default", label: "Default" },
                    { value: "round", label: "Round" },
                  ]}
                />
              </Field>
            </Stack>
          </Card>
          <Card title="Footer and support">
            <Stack gap={14}>
              <Field label="Footer text" htmlFor="brand-footer" hint="E.g. a copyright line or data disclaimer.">
                <Input id="brand-footer" value={draft.footer_text} maxLength={120} onChange={(event) => set("footer_text", event.target.value)} />
              </Field>
              <Field label="Support email" htmlFor="brand-email" hint="Shown on the sign-in page and in the sidebar.">
                <Input id="brand-email" type="email" value={draft.support_email ?? ""} onChange={(event) => set("support_email", event.target.value || null)} />
              </Field>
              <Switch label='Show "Powered by DataBix"' checked={draft.show_powered_by} onChange={(event) => set("show_powered_by", event.target.checked)} />
            </Stack>
          </Card>
        </Stack>
        <div style={{ position: "sticky", top: 76 }}>
          <Card
            title="Live preview"
            subtitle={
              dirty
                ? "Unsaved changes"
                : details.data?.customized && details.data.updated_at
                  ? `Saved by ${details.data.updated_by} · ${formatDateTime(details.data.updated_at)}`
                  : "Deployment defaults"
            }
            actions={
              <SegmentedControl
                label="Preview mode"
                value={previewMode}
                onChange={setPreviewMode}
                options={[
                  { value: "light", label: <span className="dbx-sr-only">Light</span>, icon: Sun },
                  { value: "dark", label: <span className="dbx-sr-only">Dark</span>, icon: Moon },
                ]}
              />
            }
          >
            <div data-mode={previewMode}>
              <Preview draft={draft} mode={previewMode} />
            </div>
            <p className="dbx-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Light/dark here previews brand colours; surfaces follow your own theme.
            </p>
          </Card>
        </div>
      </Grid>
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset branding?"
        description="This removes the saved customisation; the deployment's default branding comes back for everyone."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" icon={RotateCcw} onClick={reset}>Reset branding</Button>
          </>
        }
      />
    </Page>
  );
}
