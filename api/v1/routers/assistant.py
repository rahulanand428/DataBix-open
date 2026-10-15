import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from api.v1.schemas.assistant import AskRequest, AskResponse, AssistantStatus
from auth.dependencies import get_current_user
from models import User
from services.assistant import (
    Assistant,
    AssistantBusyError,
    AssistantDisabledError,
    AssistantUnavailableError,
    assistant_enabled,
    assistant_model,
    assistant_slot,
    get_assistant,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])
audit_logger = logging.getLogger("databix.audit")


@router.get("/status", response_model=AssistantStatus)
def status(_user: Annotated[User, Depends(get_current_user)]) -> AssistantStatus:
    enabled = assistant_enabled()
    return AssistantStatus(enabled=enabled, model=assistant_model() if enabled else None)


@router.post("/ask", response_model=AskResponse)
def ask(
    payload: AskRequest,
    user: Annotated[User, Depends(get_current_user)],
    assistant: Annotated[Assistant, Depends(get_assistant)],
) -> AskResponse:
    if not assistant_enabled():
        raise HTTPException(status_code=503, detail="The AI assistant is not enabled")
    try:
        with assistant_slot(user.id):
            result = assistant.ask(
                payload.question, [turn.model_dump() for turn in payload.history]
            )
    except AssistantBusyError as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except AssistantDisabledError as error:
        raise HTTPException(status_code=503, detail="The AI assistant is not enabled") from error
    except AssistantUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    audit_logger.info(
        json.dumps(
            {
                "event": "assistant_question",
                "user": user.username,
                "tools": [call["name"] for call in result["tool_calls"]],
            }
        )
    )
    return AskResponse.model_validate(result)
