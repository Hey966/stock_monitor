from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from app.config import settings
from app.logger import get_logger
from app.services.line_messaging_service import reply_text
from app.services.user_service import add_user

logger = get_logger(__name__)


class LineBotServiceError(Exception):
    """Raised when LINE webhook handling fails."""


def verify_signature(body: bytes, signature: str) -> bool:
    channel_secret = settings.line_channel_secret.strip()

    if not channel_secret:
        logger.error("LINE channel secret is empty.")
        return False

    digest = hmac.new(
        channel_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()

    import base64
    expected_signature = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected_signature, signature)


def parse_events(body: bytes) -> list[dict[str, Any]]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise LineBotServiceError("Invalid webhook JSON body.") from exc

    events = payload.get("events", [])
    if not isinstance(events, list):
        raise LineBotServiceError("Webhook events format is invalid.")

    return events


def _get_user_id(event: dict[str, Any]) -> str:
    source = event.get("source", {})
    if not isinstance(source, dict):
        return ""
    return str(source.get("userId", "")).strip()


def _get_reply_token(event: dict[str, Any]) -> str:
    return str(event.get("replyToken", "")).strip()


def _handle_follow_event(event: dict[str, Any]) -> None:
    user_id = _get_user_id(event)
    reply_token = _get_reply_token(event)

    if not user_id:
        logger.warning("Follow event missing userId.")
        return

    is_new_user = add_user(user_id)
    logger.info(f"Follow event received. user_id={user_id}, is_new={is_new_user}")

    if reply_token:
        reply_text(reply_token, "歡迎加入 Stock Monitor！")


def _handle_message_event(event: dict[str, Any]) -> None:
    user_id = _get_user_id(event)
    reply_token = _get_reply_token(event)
    message = event.get("message", {})

    if user_id:
        add_user(user_id)

    if not isinstance(message, dict):
        logger.warning("Message event has invalid message payload.")
        return

    message_type = str(message.get("type", "")).strip()
    text = str(message.get("text", "")).strip()

    if message_type != "text":
        if reply_token:
            reply_text(reply_token, "目前只支援文字訊息。")
        return

    logger.info(f"Text message received from {user_id}: {text}")

    if not reply_token:
        return

    if text in {"hi", "Hi", "hello", "Hello", "你好"}:
        reply_text(reply_token, "你好，我是 Stock Monitor 機器人。")
    elif text in {"註冊", "register"}:
        add_user(user_id)
        reply_text(reply_token, "已完成註冊。")
    elif text in {"名單", "users"}:
        reply_text(reply_token, f"你的 user_id 已記錄：{user_id}")
    else:
        reply_text(reply_token, f"收到訊息：{text}")


def handle_event(event: dict[str, Any]) -> None:
    event_type = str(event.get("type", "")).strip()

    if event_type == "follow":
        _handle_follow_event(event)
        return

    if event_type == "message":
        _handle_message_event(event)
        return

    logger.info(f"Unhandled event type: {event_type}")


def handle_webhook(body: bytes, signature: str) -> dict[str, Any]:
    if not verify_signature(body, signature):
        raise LineBotServiceError("Invalid LINE signature.")

    events = parse_events(body)

    for event in events:
        try:
            handle_event(event)
        except Exception as exc:
            logger.exception(f"Failed to handle event: {exc}")

    return {
        "status": "ok",
        "event_count": len(events),
    }