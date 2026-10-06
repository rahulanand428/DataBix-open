from typing import Annotated

from fastapi import APIRouter, Depends

from api.v1.schemas.users import User
from auth.dependencies import get_current_user
from models.user_models import User as UserModel

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=User)
def read_users_me(
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> UserModel:
    return current_user