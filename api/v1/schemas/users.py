from pydantic import BaseModel, ConfigDict, Field

class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=100)

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)

class User(UserBase):
    id: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
