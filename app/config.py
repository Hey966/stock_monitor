from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


@dataclass
class Settings:
    app_name: str = os.getenv("APP_NAME", "Stock Monitor")
    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = int(os.getenv("APP_PORT", "8000"))
    app_debug: bool = os.getenv("APP_DEBUG", "false").lower() == "true"

    line_channel_access_token: str = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    line_channel_secret: str = os.getenv("LINE_CHANNEL_SECRET", "").strip()

    enable_scheduler: bool = os.getenv("ENABLE_SCHEDULER", "false").lower() == "true"
    enable_ngrok: bool = os.getenv("ENABLE_NGROK", "false").lower() == "true"

    ngrok_auth_token: str = os.getenv("NGROK_AUTH_TOKEN", "").strip()
    ngrok_domain: str = os.getenv("NGROK_DOMAIN", "").strip()

    line_users_file: str = str(DATA_DIR / "line_users.json")
    state_file: str = str(DATA_DIR / "state.json")
    results_file: str = str(DATA_DIR / "results.json")

    monitor_symbols: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        symbols_raw = os.getenv("MONITOR_SYMBOLS", "2330,0050")
        self.monitor_symbols = [
            symbol.strip()
            for symbol in symbols_raw.split(",")
            if symbol.strip()
        ]

        DATA_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()