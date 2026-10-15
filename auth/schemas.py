from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator


def _check_bcrypt_length(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("password cannot exceed 72 UTF-8 bytes")
    return value


# bcrypt only uses the first 72 bytes, so longer passwords are rejected outright.
BcryptPassword = Annotated[
    str, Field(min_length=8, max_length=72), AfterValidator(_check_bcrypt_length)
]


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=100)

class UserCreate(UserBase):
    password: BcryptPassword

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_admin: bool

    model_config = ConfigDict(from_attributes=True)
