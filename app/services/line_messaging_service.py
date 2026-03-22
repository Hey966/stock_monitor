from __future__ import annotations

from typing import Any

import requests

from app.config import settings
from app.logger import get_logger

logger = get_logger(__name__)


class LineMessagingServiceError(Exception):
    """Raised when LINE Messaging API request fails."""


class LineMessagingService:
    PUSH_URL = "https://api.line.me/v2/bot/message/push"
    REPLY_URL = "https://api.line.me/v2/bot/message/reply"
    DEFAULT_TIMEOUT_SECONDS = 10

    def __init__(
        self,
        channel_access_token: str,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.channel_access_token = channel_access_token.strip()
        self.timeout_seconds = timeout_seconds

    def _get_headers(self) -> dict[str, str]:
        if not self.channel_access_token:
            raise LineMessagingServiceError("LINE channel access token is empty.")

        return {
            "Authorization": f"Bearer {self.channel_access_token}",
            "Content-Type": "application/json",
        }

    def _post(self, url: str, payload: dict[str, Any]) -> bool:
        try:
            response = requests.post(
                url,
                headers=self._get_headers(),
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            logger.error(f"LINE API request error: {exc}")
            raise LineMessagingServiceError(str(exc)) from exc

        if response.status_code >= 400:
            logger.error(
                "LINE API request failed. "
                f"status={response.status_code}, body={response.text}"
            )
            raise LineMessagingServiceError(
                f"LINE API request failed with status {response.status_code}"
            )

        return True

    def push_text_message(self, to_user_id: str, message: str) -> bool:
        payload = {
            "to": to_user_id,
            "messages": [
                {
                    "type": "text",
                    "text": message,
                }
            ],
        }
        return self._post(self.PUSH_URL, payload)

    def reply_text_message(self, reply_token: str, message: str) -> bool:
        payload = {
            "replyToken": reply_token,
            "messages": [
                {
                    "type": "text",
                    "text": message,
                }
            ],
        }
        return self._post(self.REPLY_URL, payload)


line_messaging_service = LineMessagingService(
    channel_access_token=settings.line_channel_access_token
)


def push_text(to_user_id: str, message: str) -> bool:
    return line_messaging_service.push_text_message(to_user_id, message)


def reply_text(reply_token: str, message: str) -> bool:
    return line_messaging_service.reply_text_message(reply_token, message)