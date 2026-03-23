from __future__ import annotations

import subprocess
import time

import requests

from app.config import settings
from app.logger import get_logger

logger = get_logger(__name__)

NGROK_API_URL = "http://127.0.0.1:4040/api/tunnels"


def start_ngrok(port: int = 8000) -> str:
    logger.info("Starting ngrok...")

    if settings.ngrok_auth_token:
        try:
            subprocess.run(
                ["ngrok", "config", "add-authtoken", settings.ngrok_auth_token],
                check=False,
                stdout=None,
                stderr=None,
            )
        except Exception as exc:
            logger.warning(f"Set ngrok authtoken failed: {exc}")

    subprocess.Popen(
        ["ngrok", "http", str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    time.sleep(3)

    try:
        response = requests.get(NGROK_API_URL, timeout=5)
        response.raise_for_status()
        data = response.json()

        for tunnel in data.get("tunnels", []):
            public_url = str(tunnel.get("public_url", "")).strip()
            if public_url.startswith("https://"):
                logger.info(f"Ngrok started: {public_url}")
                return public_url

    except Exception as exc:
        logger.error(f"Failed to get ngrok URL: {exc}")

    raise RuntimeError("Ngrok start failed")