from fastapi import APIRouter, Response

from auth.dependencies import DatabaseSession
from services.branding import PublicBranding, load_branding, public_branding

router = APIRouter(prefix="/branding", tags=["branding"])


@router.get("", response_model=PublicBranding)
def get_branding(db: DatabaseSession, response: Response) -> PublicBranding:
    """Public: the login page needs the brand before anyone signs in."""
    # Revalidate every time so a saved brand shows up on the next page load.
    response.headers["Cache-Control"] = "no-cache"
    return public_branding(load_branding(db))
