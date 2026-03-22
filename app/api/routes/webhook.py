from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request

from app.logger import get_logger
from app.services.line_bot_service import LineBotServiceError, handle_webhook

router = APIRouter()
logger = get_logger(__name__)


@router.post("/callback")
async def callback(
    request: Request,
    x_line_signature: str = Header(default="", alias="X-Line-Signature"),
) -> dict:
    try:
        body = await request.body()
        return handle_webhook(body=body, signature=x_line_signature)
    except LineBotServiceError as exc:
        logger.warning(f"Webhook rejected: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(f"Webhook error: {exc}")
        raise HTTPException(status_code=500, detail="Internal server error") from exc