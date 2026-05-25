from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def send_discord_alert(payload: dict[str, Any]) -> dict[str, Any]:
    webhook = os.getenv("DISCORD_WEBHOOK_URL", "")
    if not webhook:
        return {"ok": False, "error": "DISCORD_WEBHOOK_URL is not set"}

    code = str(payload.get("code") or "STX")
    title = str(payload.get("title") or "STX 警報")
    score = str(payload.get("score") or "-")
    message = str(payload.get("message") or "盤中警報觸發")

    content = f"🔥 **{title}**\n股票：{code}\n分數：{score}\n{message}"
    body = json.dumps({"content": content}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "STX-Alert"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=8) as res:
        return {"ok": 200 <= res.status < 300, "status": res.status}
