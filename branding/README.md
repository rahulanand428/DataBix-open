# White-label branding

DataBix can be rebranded per deployment without rebuilding any image. The
backend serves the brand at `GET /api/v1/branding` (public, so the sign-in page
can use it) and every microfrontend themes itself from it at runtime.

Two layers, highest priority last:

1. **Deployment defaults**: `BRANDING_FILE` points at a JSON file such as
   [`default.json`](default.json). Compose mounts this folder read-only at
   `/app/branding`, so set `BRANDING_FILE=/app/branding/default.json` (or your own
   file) in `.env`.
2. **Administrator overrides**: saved from *Administration → Branding* in the UI
   (`PUT /api/v1/admin/branding`) and stored in PostgreSQL. *Reset to defaults*
   removes them.

| Field | Values |
| --- | --- |
| `product_name`, `tagline`, `login_headline`, `footer_text` | Plain text (rendered as text, never HTML) |
| `logo_data_url`, `favicon_data_url` | `data:image/png|jpeg|webp;base64,…` up to 200 KB / 32 KB. The file bytes must match the declared type. SVG is rejected because it can carry script. |
| `primary_color`, `accent_color` | `#RRGGBB` |
| `sidebar_style` | `dark`, `light`, `brand` (sidebar in the primary colour) |
| `font_family` | `Inter`, `IBM Plex Sans`, `Source Sans 3`, `System` (all self-hosted) |
| `radius` | `sharp`, `default`, `round` |
| `default_theme` | `system`, `light`, `dark` (users can still choose) |
| `support_email` | Shown on the sign-in page and in the sidebar |
| `show_powered_by` | Adds "Powered by DataBix" when the product name differs |

## Accessible colours by construction

Admins can pick any primary colour, so the UI checks it at runtime:

- Text on filled brand surfaces (buttons, the brand sidebar) is white or ink,
  whichever contrasts more.
- Links use the brand colour nudged in OKLCH lightness until it reaches 4.5:1.
- Charts use the brand colour only if it passes the chart palette's rules in
  that mode (OKLCH lightness band, chroma ≥ 0.10, 3:1 against the chart
  surface); otherwise they fall back to the validated default blue, and the
  branding editor says so.

## Example

[`examples/acme.json`](examples/acme.json) is a complete second brand (logo,
violet brand sidebar, IBM Plex Sans, rounded corners). Apply it to a demo with:

```bash
docker compose exec backend python -m scripts.seed_demo --brand branding/examples/acme.json
```
