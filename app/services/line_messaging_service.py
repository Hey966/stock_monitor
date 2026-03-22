from __future__ import annotations

from typing import Optional

import requests

from app.logger import get_logger

logger = get_logger(__name__)


class LineMessagingServiceError(Exception):
    """Raised when LINE Messaging API request fails."""


class LineMessagingService:
    """
    Send messages via LINE Messaging API push message endpoint.
    """

    PUSH_URL = "https://api.line.me/v2/bot/message/push"
    DEFAULT_TIMEOUT_SECONDS = 10

    def __init__(
        self,
        channel_access_token: str,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.channel_access_token = channel_access_token.strip()
        self.timeout_seconds = timeout_seconds

    def send_text_message(self, to_user_id: str, message: str) -> bool:
        """
        Send a text push message to a LINE user.

        Args:
            to_user_id: LINE user ID
            message: Message text

        Returns:
            True if successful

        Raises:
            LineMessagingServiceError
        """
        if not self.channel_access_token:
            raise LineMessagingServiceError("LINE channel access token is empty.")

        if not to_user_id or not to_user_id.strip():
            raise LineMessagingServiceError("LINE target user ID is empty.")

        if not message or not message.strip():
            raise LineMessagingServiceError("Message is empty.")

        headers = {
            "Authorization": f"Bearer {self.channel_access_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "to": to_user_id,
            "messages": [
                {
                    "type": "text",
                    "text": message,
                }
            ],
        }

        logger.info("Sending LINE Messaging API push message to user_id=%s", to_user_id)

        try:
            response = requests.post(
                self.PUSH_URL,
                headers=headers,
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            logger.exception("LINE Messaging API request failed: %s", exc)
            raise LineMessagingServiceError(
                f"LINE Messaging API request failed: {exc}"
            ) from exc

        if response.status_code not in (200, 201):
            logger.error(
                "LINE Messaging API returned non-success status: %s, body=%s",
                response.status_code,
                response.text,
            )
            raise LineMessagingServiceError(
                f"LINE Messaging API failed with status {response.status_code}: {response.text}"
            )

        logger.info("LINE Messaging API push message sent successfully.")
        return True

    def send_stock_report(self, to_user_id: str, report_text: str) -> bool:
        """
        Send stock report via LINE Messaging API.
        """
        return self.send_text_message(to_user_id=to_user_id, message=report_text)