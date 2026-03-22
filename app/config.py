from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    LINE_CHANNEL_ACCESS_TOKEN: str = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    LINE_TO_USER_ID: str = os.getenv("LINE_TO_USER_ID", "").strip()


settings = Settings()