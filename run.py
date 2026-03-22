from __future__ import annotations

import uvicorn

from app.config import settings


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=False,  # 先固定關掉，避免 Windows/VSCode 誤觸發重載
    )