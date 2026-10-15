"""White-label branding: product name, logo, colours, font and theme.

Defaults come from BRANDING_FILE (a JSON file, e.g. mounted per customer) and
can be overridden at runtime by administrators; overrides live in the
branding_settings table. Every field is validated strictly because the public
branding endpoint feeds values straight into the UI's theme.
"""

import base64
import binascii
import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from models import BrandingSettings

logger = logging.getLogger(__name__)

HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"
_DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$")
_MAGIC_BYTES = {
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpeg": (b"\xff\xd8\xff",),
    "webp": (b"RIFF",),
}
MAX_LOGO_BYTES = 200 * 1024
MAX_FAVICON_BYTES = 32 * 1024
_SETTINGS_ROW_ID = 1


def _validate_image_data_url(value: str | None, max_bytes: int) -> str | None:
    """Accept only base64 PNG/JPEG/WebP data URLs whose bytes match the declared type.

    SVG is deliberately excluded: it can carry script.
    """
    if value is None or value == "":
        return None
    match = _DATA_URL.fullmatch(value)
    if match is None:
        raise ValueError("must be a base64 data URL of a PNG, JPEG or WebP image")
    kind, payload = match.groups()
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("image data is not valid base64") from error
    if len(raw) > max_bytes:
        raise ValueError(f"image must be at most {max_bytes // 1024} KB")
    if not raw.startswith(_MAGIC_BYTES[kind]) or (kind == "webp" and raw[8:12] != b"WEBP"):
        raise ValueError(f"image content is not a valid {kind.upper()} file")
    return value


class BrandingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: str = Field(default="DataBix", min_length=1, max_length=40)
    tagline: str = Field(default="Short-selling intelligence", max_length=80)
    login_headline: str = Field(
        default="Market short-selling activity, at a glance", max_length=100
    )
    logo_data_url: str | None = None
    favicon_data_url: str | None = None
    primary_color: str = Field(default="#2563EB", pattern=HEX_COLOR)
    accent_color: str = Field(default="#0D9488", pattern=HEX_COLOR)
    sidebar_style: Literal["dark", "light", "brand"] = "dark"
    font_family: Literal["Inter", "IBM Plex Sans", "Source Sans 3", "System"] = "Inter"
    radius: Literal["sharp", "default", "round"] = "default"
    default_theme: Literal["system", "light", "dark"] = "system"
    footer_text: str = Field(default="", max_length=120)
    support_email: str | None = Field(
        default=None, max_length=254, pattern=r"^[^@\s<>\"'()]+@[^@\s<>\"'()]+\.[A-Za-z]{2,}$"
    )
    show_powered_by: bool = True

    @field_validator("product_name", "tagline", "login_headline", "footer_text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("primary_color", "accent_color")
    @classmethod
    def normalize_color(cls, value: str) -> str:
        return value.upper()

    @field_validator("support_email", mode="before")
    @classmethod
    def blank_email_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("logo_data_url")
    @classmethod
    def validate_logo(cls, value: str | None) -> str | None:
        return _validate_image_data_url(value, MAX_LOGO_BYTES)

    @field_validator("favicon_data_url")
    @classmethod
    def validate_favicon(cls, value: str | None) -> str | None:
        return _validate_image_data_url(value, MAX_FAVICON_BYTES)


class PublicBranding(BrandingConfig):
    """What anyone may see, including before sign-in."""

    customized: bool = False


class BrandingResponse(PublicBranding):
    """Admin view: also says who last changed the branding and when."""

    updated_at: datetime | None = None
    updated_by: str | None = None


def public_branding(branding: BrandingResponse) -> PublicBranding:
    return PublicBranding.model_validate(branding.model_dump(exclude={"updated_at", "updated_by"}))


def default_branding() -> BrandingConfig:
    path = os.getenv("BRANDING_FILE")
    if not path:
        return BrandingConfig()
    try:
        return BrandingConfig.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValidationError):
        # A broken branding file must not take the API down; fall back loudly.
        logger.error("Ignoring invalid BRANDING_FILE %s", path, exc_info=True)
        return BrandingConfig()


def load_branding(session: Session) -> BrandingResponse:
    defaults = default_branding()
    row = session.get(BrandingSettings, _SETTINGS_ROW_ID)
    if row is None:
        return BrandingResponse(**defaults.model_dump())
    try:
        merged = BrandingConfig.model_validate({**defaults.model_dump(), **row.settings})
    except ValidationError:
        logger.error("Ignoring invalid stored branding overrides", exc_info=True)
        return BrandingResponse(**defaults.model_dump())
    return BrandingResponse(
        **merged.model_dump(),
        customized=True,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


def save_branding(session: Session, config: BrandingConfig, username: str) -> BrandingResponse:
    row = session.get(BrandingSettings, _SETTINGS_ROW_ID)
    now = datetime.now(UTC)
    if row is None:
        row = BrandingSettings(id=_SETTINGS_ROW_ID, settings={}, updated_by=username, updated_at=now)
        session.add(row)
    row.settings = config.model_dump()
    row.updated_by = username
    row.updated_at = now
    session.commit()
    return load_branding(session)


def reset_branding(session: Session) -> BrandingResponse:
    row = session.get(BrandingSettings, _SETTINGS_ROW_ID)
    if row is not None:
        session.delete(row)
        session.commit()
    return load_branding(session)
