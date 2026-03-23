from __future__ import annotations

import uvicorn

from app.config import settings
from app.services.ngrok_service import start_ngrok


if __name__ == "__main__":
    print("ENABLE_NGROK =", settings.enable_ngrok)

    if settings.enable_ngrok:
        url = start_ngrok(settings.app_port)
        print("\n" + "=" * 50)
        print(f"NGROK URL: {url}")
        print(f"Webhook URL: {url}/callback")
        print("=" * 50 + "\n")

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=False,
    )