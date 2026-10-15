from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def history_starts_with_user(self) -> "AskRequest":
        if self.history and self.history[0].role != "user":
            raise ValueError("history must start with a user turn")
        return self


class ToolCall(BaseModel):
    name: str
    input: dict[str, Any]


class AskResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCall]
    model: str


class AssistantStatus(BaseModel):
    enabled: bool
    model: str | None
