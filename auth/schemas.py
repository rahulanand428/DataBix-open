from pydantic import BaseModel, ConfigDict, Field, field_validator

class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=100)

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("password")
    @classmethod
    def validate_bcrypt_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password cannot exceed 72 UTF-8 bytes")
        return value

class UserResponse(UserBase):
    id: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
